const API_KEY = 'q18n2zy9lpfm3t9tspiis9sa90tivhv0ixt7babmdaho4tc2y'; // Your API key
const API_URL = 'https://api.wordnik.com/v4/words.json/randomWord';

const gameContainer = document.getElementById("game-container");
const wordInput = document.getElementById("word-input");
const scoreDisplay = document.getElementById("score");
const gameOverScreen = document.getElementById("game-over");

// Game settings
const DIFFICULTY_SETTINGS = {
    EASY: { speed: 2, interval: 2000, scoreMultiplier: 1 },
    MEDIUM: { speed: 3, interval: 1500, scoreMultiplier: 2 },
    HARD: { speed: 5, interval: 1000, scoreMultiplier: 3 }
};

// Audio system
const AUDIO = {
    bgMusic: new Audio('https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3'),
    type: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-single-key-press-in-a-laptop-2541.mp3'),
    success: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-unlock-game-notification-253.mp3'),
    powerup: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-positive-interface-beep-221.mp3'),
    achievement: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3'),
    gameOver: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-retro-arcade-game-over-470.mp3')
};

// Audio state management
let audioInitialized = false;
let isMuted = false;

// Initialize audio system
const initAudio = () => {
    if (audioInitialized) return;
    
    Object.values(AUDIO).forEach(audio => {
        audio.load();
        if (audio === AUDIO.bgMusic) {
            audio.volume = 0.4; // Slightly increased volume for the new track
            audio.loop = true;
        } else {
            audio.volume = 0.5;
        }
    });
    
    audioInitialized = true;
};

// Enhanced play sound function
const playSound = (soundName) => {
    if (!audioInitialized || isMuted || !AUDIO[soundName]) return;
    
    const sound = AUDIO[soundName];
    
    // Create a new audio element for overlapping sounds
    if (soundName === 'type' || soundName === 'success') {
        const clone = sound.cloneNode();
        clone.volume = sound.volume;
        clone.play().catch(err => console.log('Audio play failed:', err));
        // Clean up cloned audio element after it's done
        clone.onended = () => clone.remove();
    } else {
        sound.currentTime = 0;
        sound.play().catch(err => console.log('Audio play failed:', err));
    }
};

// Enhanced toggle audio function
const toggleAudio = () => {
    if (!audioInitialized) return;
    
    isMuted = !isMuted;
    Object.values(AUDIO).forEach(audio => {
        audio.muted = isMuted;
    });
    
    if (!isMuted && !AUDIO.bgMusic.playing) {
        AUDIO.bgMusic.play().catch(err => console.log('Background music failed to resume:', err));
    }
    
    showEffect(isMuted ? '🔇 Sound Off' : '🔊 Sound On');
};

let score = 0;
let words = [];
let gameInterval;
let wordInputValue = "";
let wordCache = [];
let lastApiCall = 0;
let currentLevel = 'EASY';
let wordsTyped = 0;
let gameStartTime = Date.now();
let accuracy = { correct: 0, total: 0 };
let apiFailCount = 0;
const API_COOLDOWN = 1000; // Increased cooldown to avoid rate limits
const MAX_API_FAILS = 3; // Switch to fallback after this many consecutive failures

// Expanded fallback word list
const fallbackWords = [
    // Common 3-4 letter words
    "the", "and", "cat", "dog", "run", "jump", "play", "fast", "slow", "bird",
    "fish", "book", "read", "walk", "talk", "sing", "eat", "food", "drink",
    // 5-6 letter words
    "apple", "banana", "orange", "purple", "yellow", "green", "silver", "golden",
    "button", "window", "screen", "pencil", "paper", "folder", "music", "sound",
    "light", "heavy", "water", "coffee", "simple", "coding", "typing", "gaming",
    // 7-8 letter words
    "computer", "keyboard", "monitor", "speaker", "program", "internet", "website",
    "download", "software", "hardware", "network", "picture", "drawing", "painting",
    // 9+ letter words
    "technology", "development", "programming", "application", "javascript", "experience",
    "dictionary", "vocabulary", "knowledge", "education", "university", "challenge",
    // Tech terms
    "code", "bug", "debug", "array", "string", "number", "object", "function",
    "method", "class", "style", "event", "loop", "async", "await", "promise",
    "server", "client", "data", "cache", "error", "syntax", "logic", "algorithm",
    // Common verbs
    "write", "read", "speak", "listen", "watch", "create", "build", "design",
    "think", "learn", "teach", "study", "work", "play", "rest", "sleep", "wake",
    // Adjectives
    "quick", "slow", "smart", "clever", "bright", "dark", "loud", "quiet",
    "happy", "sad", "angry", "calm", "busy", "free", "new", "old", "young"
];

// Keep track of recently used words to avoid repetition
const recentlyUsedWords = new Set();
const MAX_RECENT_WORDS = 50;

// Power-up types
const POWER_UPS = {
    SLOW_TIME: { color: '#4CAF50', symbol: '⏰', duration: 5000, chance: 0.1 },
    DOUBLE_SCORE: { color: '#FFC107', symbol: '2️⃣', duration: 5000, chance: 0.05 },
    CLEAR_SCREEN: { color: '#FF5722', symbol: '💥', duration: 0, chance: 0.03 },
    SHIELD: { color: '#2196F3', symbol: '🛡️', duration: 7000, chance: 0.07 }
};

// Achievement system
const ACHIEVEMENTS = {
    SPEED_DEMON: { name: "Speed Demon", description: "Type 5 words in under 5 seconds", earned: false },
    COMBO_MASTER: { name: "Combo Master", description: "Get a 10x combo", earned: false },
    ACCURACY_KING: { name: "Accuracy King", description: "100% accuracy after 20 words", earned: false },
    SURVIVOR: { name: "Survivor", description: "Reach Hard difficulty", earned: false },
    POWERUP_COLLECTOR: { name: "Power Collector", description: "Collect all types of power-ups", earned: false }
};

let collectedPowerups = new Set();

let activeEffects = {
    slowTime: false,
    doubleScore: false,
    shield: false
};

// Add after the game settings
let combo = 0;
let lastWordTime = 0;
const COMBO_TIMEOUT = 2000; // 2 seconds to maintain combo

// Fetch words from API
const fetchWordBatch = async () => {
    const now = Date.now();
    if (now - lastApiCall < API_COOLDOWN) {
        return false;
    }
    
    try {
        lastApiCall = now;
        const response = await fetch(`${API_URL}?api_key=${API_KEY}&minLength=3&maxLength=10`);
        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        wordCache.push(data.word.toLowerCase());
        apiFailCount = 0;
        return true;
    } catch (error) {
        console.error('Error fetching words:', error);
        apiFailCount++;
        return false;
    }
};

// Get a unique word from the fallback list
const getUniqueWord = () => {
    let attempts = 0;
    let word;
    
    do {
        word = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
        attempts++;
    } while (recentlyUsedWords.has(word) && attempts < 10);

    recentlyUsedWords.add(word);
    
    if (recentlyUsedWords.size > MAX_RECENT_WORDS) {
        const iterator = recentlyUsedWords.values();
        recentlyUsedWords.delete(iterator.next().value);
    }

    return word;
};

// Get a random word
const getRandomWord = async () => {
    if (apiFailCount >= MAX_API_FAILS) {
        return getUniqueWord();
    }

    if (wordCache.length < 5) {
        await fetchWordBatch();
    }

    if (wordCache.length > 0) {
        const word = wordCache.pop();
        recentlyUsedWords.add(word);
        return word;
    }

    return getUniqueWord();
};

// Game stats
const updateStats = (isCorrect) => {
    accuracy.total++;
    if (isCorrect) {
        accuracy.correct++;
    }
};

// Calculate WPM (Words Per Minute)
const calculateWPM = () => {
    const minutesElapsed = (Date.now() - gameStartTime) / 60000;
    return Math.round(wordsTyped / minutesElapsed);
};

// Update difficulty based on score
const updateDifficulty = () => {
    if (score >= 30) {
        currentLevel = 'HARD';
        if (!ACHIEVEMENTS.SURVIVOR.earned) {
            ACHIEVEMENTS.SURVIVOR.earned = true;
            showAchievement(ACHIEVEMENTS.SURVIVOR);
        }
    } else if (score >= 15) {
        currentLevel = 'MEDIUM';
    }
    return DIFFICULTY_SETTINGS[currentLevel];
};

// Generate a non-overlapping horizontal position
const generatePosition = () => {
    return Math.random() * 90; // Random position between 0-90%
};

// Modified createWord function to add word length-based scoring
const createWord = async () => {
    const word = await getRandomWord();
    const wordElement = document.createElement("div");
    wordElement.classList.add("falling-word");
    wordElement.textContent = word;
    
    // Add color coding based on word length
    if (word.length > 8) {
        wordElement.classList.add('difficult-word');
    } else if (word.length > 5) {
        wordElement.classList.add('medium-word');
    }

    const posX = generatePosition();
    wordElement.style.left = `${posX}%`;
    wordElement.style.top = `0px`;
    gameContainer.appendChild(wordElement);
    words.push(wordElement);
};

// Create power-up element
const createPowerUp = () => {
    if (Math.random() > 0.15) return; // 15% chance to spawn power-up

    const powerUpTypes = Object.entries(POWER_UPS);
    const [type, config] = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
    
    if (Math.random() > config.chance) return;

    const powerUpElement = document.createElement("div");
    powerUpElement.classList.add('power-up');
    powerUpElement.innerHTML = config.symbol;
    powerUpElement.style.color = config.color;
    powerUpElement.dataset.type = type;

    const posX = generatePosition();
    powerUpElement.style.left = `${posX}%`;
    powerUpElement.style.top = '0px';
    gameContainer.appendChild(powerUpElement);

    // Make power-ups fall
    const fallInterval = setInterval(() => {
        const currentTop = parseFloat(powerUpElement.style.top);
        if (currentTop < gameContainer.offsetHeight - 30) {
            powerUpElement.style.top = `${currentTop + 2}px`;
        } else {
            clearInterval(fallInterval);
            gameContainer.removeChild(powerUpElement);
        }
    }, 50);

    // Collect power-up on hover
    powerUpElement.addEventListener('mouseover', () => {
        activatePowerUp(type);
        gameContainer.removeChild(powerUpElement);
        clearInterval(fallInterval);
    });
};

// Activate power-up effects
const activatePowerUp = (type) => {
    const config = POWER_UPS[type];
    playSound('powerup');
    
    // Check for power-up collector achievement
    collectedPowerups.add(type);
    if (collectedPowerups.size === Object.keys(POWER_UPS).length && !ACHIEVEMENTS.POWERUP_COLLECTOR.earned) {
        ACHIEVEMENTS.POWERUP_COLLECTOR.earned = true;
        showAchievement(ACHIEVEMENTS.POWERUP_COLLECTOR);
    }
    
    switch(type) {
        case 'SLOW_TIME':
            activeEffects.slowTime = true;
            showEffect('⏰ Slow Motion!');
            setTimeout(() => {
                activeEffects.slowTime = false;
                showEffect('Speed Normal');
            }, config.duration);
            break;
            
        case 'DOUBLE_SCORE':
            activeEffects.doubleScore = true;
            showEffect('2️⃣ Double Score!');
            setTimeout(() => {
                activeEffects.doubleScore = false;
                showEffect('Score Normal');
            }, config.duration);
            break;
            
        case 'CLEAR_SCREEN':
            showEffect('💥 Screen Cleared!');
            words.forEach(word => gameContainer.removeChild(word));
            words = [];
            break;
            
        case 'SHIELD':
            activeEffects.shield = true;
            showEffect('🛡️ Shield Active!');
            setTimeout(() => {
                activeEffects.shield = false;
                showEffect('Shield Down');
            }, config.duration);
            break;
    }
};

// Show effect notification
const showEffect = (message) => {
    const effect = document.createElement('div');
    effect.classList.add('effect-notification');
    effect.textContent = message;
    gameContainer.appendChild(effect);
    
    setTimeout(() => {
        effect.classList.add('fade-out');
        setTimeout(() => gameContainer.removeChild(effect), 500);
    }, 1500);
};

// Modify the moveWords function to account for power-ups
const moveWords = () => {
    const { speed } = updateDifficulty();
    const actualSpeed = activeEffects.slowTime ? speed * 0.5 : speed;
    
    words.forEach(word => {
        const currentTop = parseFloat(word.style.top);
        if (currentTop < gameContainer.offsetHeight - 50) {
            word.style.top = `${currentTop + actualSpeed}px`;
        } else {
            if (!activeEffects.shield) {
                gameContainer.removeChild(word);
                words = words.filter(w => w !== word);
                updateStats(false);
                if (words.length === 0) {
                    endGame();
                }
            } else {
                // Bounce word back up when shield is active
                word.style.top = '0px';
            }
        }
    });
};

// Modify checkInput to account for power-ups
const checkInput = () => {
    if (wordInputValue === "") return;

    words.forEach(word => {
        if (word.textContent === wordInputValue) {
            gameContainer.removeChild(word);
            words = words.filter(w => w !== word);
            
            const { scoreMultiplier } = DIFFICULTY_SETTINGS[currentLevel];
            let wordScore = word.textContent.length * scoreMultiplier;
            
            // Combo system
            const now = Date.now();
            if (now - lastWordTime < COMBO_TIMEOUT) {
                combo++;
                if (combo >= 10 && !ACHIEVEMENTS.COMBO_MASTER.earned) {
                    ACHIEVEMENTS.COMBO_MASTER.earned = true;
                    showAchievement(ACHIEVEMENTS.COMBO_MASTER);
                }
                wordScore *= (1 + (combo * 0.1));
                showEffect(`Combo x${combo}!`);
                playSound('success'); // Play combo sound
            } else {
                combo = 0;
            }
            lastWordTime = now;
            
            // Check for speed demon achievement
            if (wordsTyped >= 4 && (now - gameStartTime) < 5000 && !ACHIEVEMENTS.SPEED_DEMON.earned) {
                ACHIEVEMENTS.SPEED_DEMON.earned = true;
                showAchievement(ACHIEVEMENTS.SPEED_DEMON);
            }
            
            if (activeEffects.doubleScore) {
                wordScore *= 2;
            }
            
            showEffect(`+${Math.round(wordScore)} points!`);
            playSound('success'); // Play success sound
            
            score += Math.round(wordScore);
            wordsTyped++;
            updateStats(true);
            
            // Check accuracy achievement
            if (accuracy.total >= 20 && accuracy.correct === accuracy.total && !ACHIEVEMENTS.ACCURACY_KING.earned) {
                ACHIEVEMENTS.ACCURACY_KING.earned = true;
                showAchievement(ACHIEVEMENTS.ACCURACY_KING);
            }
            
            scoreDisplay.textContent = `Score: ${score} | WPM: ${calculateWPM()} | Combo: x${combo} | Accuracy: ${Math.round((accuracy.correct/accuracy.total)*100)}%`;
            wordInput.value = "";
        }
    });
};

// New endGame function with detailed stats
const endGame = () => {
    clearInterval(gameInterval);
    AUDIO.bgMusic.pause();
    playSound('gameOver');
    
    const wpm = calculateWPM();
    const accuracyPercent = Math.round((accuracy.correct/accuracy.total)*100);
    
    gameOverScreen.style.display = "block";
    gameOverScreen.innerHTML = `
        <h2>Game Over!</h2>
        <p>Final Score: ${score}</p>
        <p>Words Per Minute: ${wpm}</p>
        <p>Accuracy: ${accuracyPercent}%</p>
        <p>Highest Level: ${currentLevel}</p>
        <button onclick="location.reload()">Play Again</button>
    `;
};

// Modify the game loop to include power-ups
const startGame = () => {
    gameStartTime = Date.now();
    scoreDisplay.textContent = "Score: 0 | WPM: 0 | Accuracy: 0%";
    
    // Start background music
    AUDIO.bgMusic.play().catch(err => console.log('Background music failed to start:', err));
    
    const gameLoop = async () => {
        await createWord();
        createPowerUp();
        moveWords();
        checkInput();
        
        const { interval } = updateDifficulty();
        clearInterval(gameInterval);
        gameInterval = setInterval(gameLoop, interval);
    };
    
    gameInterval = setInterval(gameLoop, DIFFICULTY_SETTINGS.EASY.interval);
};

// Handle input event for typing words
wordInput.addEventListener("input", (event) => {
    wordInputValue = event.target.value;
    playSound('type');
    checkInput();
});

// Add after the audio system setup
const createStartScreen = () => {
    const startScreen = document.createElement('div');
    startScreen.id = 'start-screen';
    startScreen.innerHTML = `
        <h1>Word Typing Game</h1>
        <p>Type the falling words before they reach the bottom!</p>
        <button id="start-button">Click to Start</button>
    `;
    document.body.appendChild(startScreen);

    // Initialize audio only after user interaction
    const startButton = document.getElementById('start-button');
    startButton.addEventListener('click', () => {
        // Initialize all audio elements
        initAudio();

        // Start the game
        AUDIO.bgMusic.play()
            .then(() => {
                startScreen.remove();
                startGame();
            })
            .catch(err => {
                console.error('Audio failed to start:', err);
                startScreen.remove();
                startGame();
            });
    });
};

// Modify the end of the file to show start screen instead of auto-starting
// Remove or comment out the direct startGame() call
// startGame();
createStartScreen();

const showAchievement = (achievement) => {
    playSound('achievement');
    const achievementElement = document.createElement('div');
    achievementElement.classList.add('achievement');
    achievementElement.innerHTML = `
        <h3>🏆 Achievement Unlocked!</h3>
        <p>${achievement.name}</p>
        <p>${achievement.description}</p>
    `;
    gameContainer.appendChild(achievementElement);
    
    setTimeout(() => {
        achievementElement.classList.add('fade-out');
        setTimeout(() => gameContainer.removeChild(achievementElement), 500);
    }, 3000);
};

// Add after game container initialization
const soundButton = document.createElement('button');
soundButton.id = 'sound-toggle';
soundButton.innerHTML = '🔊';
soundButton.onclick = () => {
    toggleAudio();
    soundButton.innerHTML = isMuted ? '🔇' : '🔊';
};
document.body.insertBefore(soundButton, gameContainer);
