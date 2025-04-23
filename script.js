// Security key - in a real app, this would be more complex
const SECRET_KEY = "SkyHighGamble_2025";

// Game state variables
let _gameState = {
    balance: 500,
    stake: 10,
    multiplier: 1.0,
    status: 'idle', // idle, flying, cashed, crashed
    startingBalance: 500, // Track the starting balance for validation
    startTime: null,
    sessionId: null,
    nextRefillTime: null // New: Track when user can get next refill
};

// House edge and crash point
const HOUSE_EDGE = 0.8; // House has 80% chance to win
let crashPoint;

// Three.js components
let scene, camera, renderer;
let planeGroup, propeller;
let frameId, gameLoopId;

// Timer variables
let timerInterval;
const REFILL_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

// DOM elements
const gameContainer = document.getElementById('game-container');
const balanceEl = document.getElementById('balance');
const multiplierEl = document.getElementById('multiplier');
const messageEl = document.getElementById('message');
const stakeInput = document.getElementById('stake');
const playBtn = document.getElementById('play-btn');
const cashoutBtn = document.getElementById('cashout-btn');
const timerContainer = document.getElementById('timer-container');
const timerEl = document.getElementById('timer');

// Generate a unique session ID
function generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Initialize game state
function initGameState() {
    // Create a new session ID
    _gameState.sessionId = generateSessionId();
    _gameState.startTime = Date.now();
    
    // Check if there's a saved state in localStorage
    const savedState = loadGameState();
    if (savedState) {
        // Validate the saved state
        if (validateGameState(savedState)) {
            _gameState = savedState;
            // Make sure the game is in idle state
            _gameState.status = 'idle';
            _gameState.multiplier = 1.0;
            updateUI();
            
            // Check if we need to start the timer
            if (_gameState.balance <= 0 && _gameState.nextRefillTime) {
                startRefillTimer();
            }
        } else {
            // If validation fails, reset to initial state
            console.log("Invalid saved state detected, resetting game");
            resetToInitialState();
            saveGameState();
        }
    } else {
        // No saved state, initialize with defaults
        resetToInitialState();
        saveGameState();
    }
}

// Reset to initial state
function resetToInitialState() {
    _gameState.balance = 500;
    _gameState.stake = 10;
    _gameState.multiplier = 1.0;
    _gameState.status = 'idle';
    _gameState.startingBalance = 500;
    _gameState.startTime = Date.now();
    _gameState.nextRefillTime = null;
    // Keep the session ID
}

// Update UI elements to match game state
function updateUI() {
    balanceEl.textContent = _gameState.balance.toFixed(2);
    multiplierEl.textContent = _gameState.multiplier.toFixed(2);
    stakeInput.value = _gameState.stake;
    
    if (_gameState.status === 'idle') {
        playBtn.textContent = 'PLAY';
        playBtn.classList.add('play');
        playBtn.classList.remove('reset');
        cashoutBtn.classList.add('disabled');
        messageEl.textContent = 'Place your bet and press PLAY!';
        
        // Disable play button if balance is 0 and timer is running
        if (_gameState.balance <= 0) {
            playBtn.classList.add('disabled');
            messageEl.textContent = 'Waiting for balance refill...';
        } else {
            playBtn.classList.remove('disabled');
        }
    }
}

// Start refill timer
function startRefillTimer() {
    // Clear any existing timer
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    // If no next refill time is set, set it now
    if (!_gameState.nextRefillTime) {
        _gameState.nextRefillTime = Date.now() + REFILL_INTERVAL;
        saveGameState();
    }
    
    // Show timer container
    timerContainer.style.display = 'block';
    
    // Update timer immediately
    updateTimer();
    
    // Set interval to update timer every second
    timerInterval = setInterval(() => {
        updateTimer();
    }, 1000);
}

// Update timer display
function updateTimer() {
    const now = Date.now();
    const timeLeft = Math.max(0, _gameState.nextRefillTime - now);
    
    if (timeLeft <= 0) {
        // Time's up! Refill balance
        clearInterval(timerInterval);
        _gameState.balance = 500;
        _gameState.nextRefillTime = null;
        timerContainer.style.display = 'none';
        updateUI();
        saveGameState();
        messageEl.textContent = 'Balance refilled! Good luck!';
        return;
    }
    
    // Format time for display (HH:MM:SS)
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    timerEl.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Encrypt game state for storage
function encryptGameState(state) {
    const stateStr = JSON.stringify(state);
    const encrypted = CryptoJS.AES.encrypt(stateStr, SECRET_KEY).toString();
    return encrypted;
}

// Decrypt game state from storage
function decryptGameState(encrypted) {
    try {
        const decrypted = CryptoJS.AES.decrypt(encrypted, SECRET_KEY).toString(CryptoJS.enc.Utf8);
        return JSON.parse(decrypted);
    } catch (e) {
        console.error("Failed to decrypt game state", e);
        return null;
    }
}

// Generate a checksum for the game state
function generateChecksum(state) {
    const stateStr = JSON.stringify({
        balance: state.balance,
        startingBalance: state.startingBalance,
        sessionId: state.sessionId,
        startTime: state.startTime,
        nextRefillTime: state.nextRefillTime
    });
    return CryptoJS.SHA256(stateStr + SECRET_KEY).toString();
}

// Save game state to localStorage
function saveGameState() {
    const stateToSave = { ..._gameState };
    // Add a checksum to verify integrity
    stateToSave.checksum = generateChecksum(stateToSave);
    
    // Encrypt before saving
    const encrypted = encryptGameState(stateToSave);
    localStorage.setItem('skyHighGameState', encrypted);
}

// Load game state from localStorage
function loadGameState() {
    const encrypted = localStorage.getItem('skyHighGameState');
    if (!encrypted) return null;
    
    return decryptGameState(encrypted);
}

// Validate game state for tampering
function validateGameState(state) {
    // Check if essential properties exist
    if (!state || typeof state.balance !== 'number' || 
        typeof state.startingBalance !== 'number' || 
        !state.sessionId || !state.startTime) {
        return false;
    }
    
    // Validate starting balance (should always be 500)
    if (state.startingBalance !== 500) {
        return false;
    }
    
    // Verify checksum
    const expectedChecksum = generateChecksum(state);
    if (state.checksum !== expectedChecksum) {
        return false;
    }
    
    // Validate balance range
    if (state.balance < 0 || state.balance > 10000) {
        return false;
    }
    
    return true;
}

// Check if balance is zero and start timer if needed
function checkBalance() {
    if (_gameState.balance <= 0 && !_gameState.nextRefillTime) {
        // Set next refill time
        _gameState.nextRefillTime = Date.now() + REFILL_INTERVAL;
        saveGameState();
        startRefillTimer();
    }
}

// Initialize Three.js scene
function initScene() {
    console.log("Initializing Three.js scene...");
    
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f3460);
    
    // Camera
    camera = new THREE.PerspectiveCamera(75, gameContainer.clientWidth / gameContainer.clientHeight, 0.1, 1000);
    camera.position.set(0, 1, 5);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(gameContainer.clientWidth, gameContainer.clientHeight);
    gameContainer.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);
    
    // Ground (runway)
    const groundGeometry = new THREE.PlaneGeometry(30, 6);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x333333,
        roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    scene.add(ground);
    
    // Create airplane
    createAirplane();
    
    // Start animation loop
    animate();
}

// Create airplane
function createAirplane() {
    planeGroup = new THREE.Group();
    
    // Fuselage
    const fuselageGeometry = new THREE.CylinderGeometry(0.2, 0.15, 1.2, 8);
    const fuselageMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red for visibility
    const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
    fuselage.rotation.z = Math.PI / 2;
    planeGroup.add(fuselage);
    
    // Wings
    const wingGeometry = new THREE.BoxGeometry(0.8, 0.05, 0.4);
    const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x3366CC });
    const wings = new THREE.Mesh(wingGeometry, wingMaterial);
    planeGroup.add(wings);
    
    // Tail
    const tailGeometry = new THREE.BoxGeometry(0.25, 0.3, 0.05);
    const tailMaterial = new THREE.MeshStandardMaterial({ color: 0x3366CC });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.position.x = -0.5;
    tail.position.y = 0.15;
    planeGroup.add(tail);
    
    // Propeller
    propeller = new THREE.Group();
    const hubGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8);
    const hubMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    hub.rotation.z = Math.PI / 2;
    propeller.add(hub);
    
    const bladeGeometry = new THREE.BoxGeometry(0.5, 0.1, 0.02);
    const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const blade1 = new THREE.Mesh(bladeGeometry, bladeMaterial);
    const blade2 = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade2.rotation.z = Math.PI / 2;
    propeller.add(blade1);
    propeller.add(blade2);
    
    propeller.position.x = 0.62;
    planeGroup.add(propeller);
    
    // Initial position - on the runway
    planeGroup.position.set(-4, -0.8, 0);
    scene.add(planeGroup);
}

// Animation loop
function animate() {
    frameId = requestAnimationFrame(animate);
    
    // Rotate propeller if game is active
    if (_gameState.status !== 'idle' && propeller) {
        propeller.rotation.x += 0.5;
    }
    
    renderer.render(scene, camera);
}

// Generate crash point with house edge
function generateCrashPoint() {
    const random = Math.random();
    
    // Apply house edge
    if (random < HOUSE_EDGE) {
        // Early crash (house wins)
        // Most crashes occur below 2x
        return 1.0 + (random * 1.0);
    } else {
        // Better odds for player (20% of the time)
        // Create a more varied distribution with occasional high multipliers
        const playerLuck = Math.random();
        
        if (playerLuck < 0.6) {
            // 60% of the 20% (so 12% overall) will be between 2-4x
            return 2.0 + (playerLuck * 2.0);
        } else if (playerLuck < 0.9) {
            // 30% of the 20% (so 6% overall) will be between 4-8x
            return 4.0 + (Math.random() * 4.0);
        } else {
            // 10% of the 20% (so 2% overall) will be between 8-20x
            return 8.0 + (Math.random() * 12.0);
        }
    }
}

// Start the game
function startGame() {
    if (_gameState.status !== 'idle' || _gameState.balance <= 0) return;
    
    const stakeAmount = parseFloat(stakeInput.value);
    if (isNaN(stakeAmount) || stakeAmount <= 0 || stakeAmount > _gameState.balance) {
        messageEl.textContent = 'Invalid stake amount!';
        return;
    }
    
    _gameState.stake = stakeAmount;
    
    // Determine crash point with house edge
    crashPoint = parseFloat(generateCrashPoint().toFixed(2));
    
    // Update balance
    _gameState.balance -= _gameState.stake;
    balanceEl.textContent = _gameState.balance.toFixed(2);
    
    // Save state after deducting stake
    saveGameState();
    
    // Update game state
    _gameState.status = 'flying';
    _gameState.multiplier = 1.0;
    multiplierEl.textContent = '1.00';
    messageEl.textContent = 'Plane is taking off!';
    
    // Update buttons
    playBtn.textContent = 'RESET';
    playBtn.classList.remove('play');
    playBtn.classList.add('reset');
    cashoutBtn.classList.remove('disabled');
    
    // Reset plane position
    planeGroup.position.set(-4, -0.8, 0);
    planeGroup.rotation.x = 0;
    planeGroup.rotation.z = 0;
    
    // Game loop - increase multiplier over time
    let currentMultiplier = 1.0;
    let flightPhase = 'takeoff';
    
    gameLoopId = setInterval(() => {
        currentMultiplier += 0.01;
        
        // Update multiplier display
        _gameState.multiplier = parseFloat(currentMultiplier.toFixed(2));
        multiplierEl.textContent = _gameState.multiplier.toFixed(2);
        
        // Animate the plane based on flight phase
        if (flightPhase === 'takeoff') {
            // Takeoff animation
            planeGroup.position.x += 0.03;
            if (planeGroup.position.y < 0.5) {
                planeGroup.position.y += 0.03;
                planeGroup.rotation.z = Math.min(planeGroup.rotation.z + 0.01, 0.2);
            } else {
                flightPhase = 'climbing';
            }
        } else if (flightPhase === 'climbing') {
            // Climbing animation
            planeGroup.position.x += 0.04;
            planeGroup.position.y += 0.04;
            planeGroup.rotation.z = Math.min(planeGroup.rotation.z + 0.005, 0.3);
            
            if (planeGroup.position.y > 1.5) {
                flightPhase = 'cruising';
            }
        } else if (flightPhase === 'cruising') {
            // Cruising animation
            planeGroup.position.x += 0.05;
        }
        
        // Check if we've hit the crash point
        if (currentMultiplier >= crashPoint) {
            // Crash the plane - fly away animation
            clearInterval(gameLoopId);
            _gameState.status = 'crashed';
            messageEl.textContent = `Plane flew away at ${crashPoint.toFixed(2)}x!`;
            cashoutBtn.classList.add('disabled');
            
            // Check if balance is zero and start timer if needed
            checkBalance();
            
            // Save state after crash
            saveGameState();
            
            // Animate the plane flying away rapidly
            const flyAway = () => {
                planeGroup.position.y += 0.15;
                planeGroup.position.x += 0.15;
                planeGroup.rotation.z += 0.05;
                
                if (planeGroup.position.y < 6) {
                    requestAnimationFrame(flyAway);
                } else {
                    // Auto-reset game after animation completes
                    setTimeout(() => {
                        resetGame();
                    }, 1500); // Wait 1.5 seconds after plane flies away
                }
            };
            
            flyAway();
        }
    }, 100);
}

// Cash out
function cashOut() {
    if (_gameState.status !== 'flying') return;
    
    clearInterval(gameLoopId);
    
    // Calculate winnings properly
    const originalStake = _gameState.stake;
    const winnings = originalStake * _gameState.multiplier;
    const profit = winnings - originalStake;
    
    // Update balance with winnings
    _gameState.balance += winnings;
    balanceEl.textContent = _gameState.balance.toFixed(2);
    
    _gameState.status = 'cashed';
    messageEl.textContent = `Cashed out at ${_gameState.multiplier.toFixed(2)}x! Won $${profit.toFixed(2)} profit on $${originalStake.toFixed(2)} stake.`;
    cashoutBtn.classList.add('disabled');
    
    // Save state after cashout
    saveGameState();
    
    // Continue flying animation but level out
    const levelOut = () => {
        planeGroup.position.x += 0.05;
        
        // Level out the plane
        if (planeGroup.rotation.z > 0) {
            planeGroup.rotation.z -= 0.01;
        }
        
        if (planeGroup.position.x < 10) {
            requestAnimationFrame(levelOut);
        } else {
            // Auto-reset game after plane flies off-screen
            setTimeout(() => {
                resetGame();
            }, 1000); // Wait 1 second after plane leaves view
        }
    };
    
    levelOut();
}

// Reset the game
function resetGame() {
    if (_gameState.status === 'idle') return;
    
    clearInterval(gameLoopId);
    _gameState.status = 'idle';
    _gameState.multiplier = 1.0;
    multiplierEl.textContent = '1.00';
    messageEl.textContent = 'Place your bet and press PLAY!';
    
    // Check if balance is zero and start timer if needed
    checkBalance();
    
    // Update buttons
    playBtn.textContent = 'PLAY';
    playBtn.classList.remove('reset');
    playBtn.classList.add('play');
    cashoutBtn.classList.add('disabled');
    
    if (_gameState.balance <= 0) {
        playBtn.classList.add('disabled');
    }
    
    // Save state after reset
    saveGameState();
}

// Handle window resize
function handleResize() {
    camera.aspect = gameContainer.clientWidth / gameContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(gameContainer.clientWidth, gameContainer.clientHeight);
}

// Event listeners
playBtn.addEventListener('click', () => {
    if (_gameState.balance <= 0) {
        messageEl.textContent = 'Wait for balance refill to play.';
        return;
    }
    
    if (_gameState.status === 'idle') {
        startGame();
    } else {
        resetGame();
    }
});

cashoutBtn.addEventListener('click', cashOut);
window.addEventListener('resize', handleResize);

// Initialize the game
window.addEventListener('DOMContentLoaded', () => {
    initGameState();
    initScene();
    
    // Check if we need to start the timer immediately
    if (_gameState.balance <= 0 && _gameState.nextRefillTime) {
        startRefillTimer();
    }
});