// javascript/frenchWordGame.js

// --- Sélection des éléments du DOM ---
const gameArea = document.getElementById("game-area");
const scoreSpan = document.getElementById("score");
const timerSpan = document.getElementById("timer");
const livesWrapper = document.getElementById("lives-wrapper");
const timerWrapper = document.getElementById("timer-wrapper");
const hearts = document.querySelectorAll(".heart");

// --- Récupération du mode depuis l'URL ---
const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") || "survival"; // "time-attack" ou "survival"
const gameType = "word";

// --- Variables de jeu ---
let score = 0;
let lives = 3;
let timeLimit = 60;   // secondes pour le mode time-attack
let timeLeft = timeLimit;

let timerInterval = null;
let spawnInterval = null;
let gameOver = false;
let isPaused = false; // Pause le jeu pendant la reconnaissance vocale

// Empêche de lancer plusieurs reconnaissances en même temps
let isListening = false;

// --- Vitesse de jeu (fallback standard) ---
function getSpeedConfig() {
  const settings = JSON.parse(localStorage.getItem("gameSettings") || "{}");
  const speedValue = Number(settings.wordSpeed) || 3;

  const fallSpeedMap = {
    1: 0.6,
    2: 0.8,
    3: 1.0,
    4: 1.3,
    5: 1.6
  };
  const spawnIntervalMap = {
    1: 4000,
    2: 3400,
    3: 3000,
    4: 2500,
    5: 2000
  };

  return {
    fallSpeed: fallSpeedMap[speedValue] || 1.0,
    spawnIntervalMs: spawnIntervalMap[speedValue] || 3000
  };
}

// --- Récupérer les mots sélectionnés depuis les paramètres ---
function getSelectedWords() {
  try {
    const settings = JSON.parse(localStorage.getItem("gameSettings") || "{}");
    const selectedWords = settings.selectedWords || [];
    if (selectedWords.length === 0) {
      // Fallback : récupérer depuis userWords
      const userWords = JSON.parse(localStorage.getItem("userWords") || "[]");
      return userWords.map(w => w.fr).filter(Boolean);
    }
    return selectedWords;
  } catch (e) {
    console.error("Erreur récupération mots :", e);
    return [];
  }
}

let WORD_LIST = getSelectedWords();

// --- Fonctions utilitaires pour la reconnaissance ---

// Supprimer accents et mettre en minuscule
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .trim();
}

// Vérifier si le texte reconnu correspond au mot
function isCorrectPronunciation(word, recognizedText) {
  if (!recognizedText) return false;

  let txt = normalize(recognizedText);
  const wordNormalized = normalize(word);

  // Comparer avec le mot exact (sans accents)
  return txt === wordNormalized || txt.includes(wordNormalized);
}

// --- Affichage des cœurs selon le nombre de vies ---
function updateHearts() {
  // index 0,1,2 -> vie 1,2,3
  hearts.forEach((heart, index) => {
    if (index < lives) {
      heart.style.opacity = "1";
      heart.style.filter = "grayscale(0)";
    } else {
      heart.style.opacity = "0.2";
      heart.style.filter = "grayscale(1)";
    }
  });
}

// --- Initialisation UI selon le mode ---
function initModeUI() {
  if (mode === "time-attack") {
    // Mode タイムアタック：on n'affiche pas les vies
    if (livesWrapper) livesWrapper.style.display = "none";
    if (timerWrapper) {
      timerWrapper.style.display = "inline-block";
      timerSpan.textContent = timeLeft;
    }
    startTimer();
  } else {
    // Mode サバイバル：on n'affiche pas le timer
    if (timerWrapper) timerWrapper.style.display = "none";
    if (livesWrapper) livesWrapper.style.display = "flex";
    updateHearts();
  }
  scoreSpan.textContent = score;
}

// --- Timer pour le mode タイムアタック ---
function startTimer() {
  timerInterval = setInterval(() => {
    // Ne pas décrémenter le timer si le jeu est en pause
    if (isPaused || gameOver) {
      return;
    }
    
    timeLeft--;
    timerSpan.textContent = timeLeft;

    if (timeLeft <= 0) {
      endGame("time");
    }
  }, 1000);
}

// --- Création d'un mot qui tombe ---
function spawnWord() {
  if (gameOver) return;

  // Vérifier qu'on a des mots disponibles
  if (WORD_LIST.length === 0) {
    console.warn("Aucun mot disponible. Veuillez sélectionner des mots dans les paramètres.");
    return;
  }

  const word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];

  const wordDiv = document.createElement("div");
  wordDiv.className = "fall-letter";
  wordDiv.textContent = word;

  const areaWidth = gameArea.clientWidth || 400;
  const x = Math.random() * (areaWidth - 100); // 100 = largeur approximative pour les mots
  wordDiv.style.left = x + "px";
  wordDiv.style.top = "-40px";

  // Ajout au DOM
  gameArea.appendChild(wordDiv);

  // Mouvement vers le bas
  let top = -40;
  const { fallSpeed } = getSpeedConfig(); // pixels par tick
  wordDiv.fallIntervalId = setInterval(() => {
    if (gameOver || isPaused) {
      return; // Ne pas supprimer l'intervalle, juste ne pas bouger
    }

    top += fallSpeed;
    wordDiv.style.top = top + "px";

    if (top > gameArea.clientHeight) {
      // Le mot a touché le bas
      clearInterval(wordDiv.fallIntervalId);
      if (wordDiv.parentNode) {
        gameArea.removeChild(wordDiv);
      }
      onMiss();
    }
  }, 20);

  // Clic sur le mot = lancer la reconnaissance vocale
  wordDiv.addEventListener("click", () => {
    if (gameOver || isListening || isPaused) return;
    startSpeechForWord(wordDiv, word);
  });
}

// --- Quand le joueur rate un mot (il tombe en bas) ---
function onMiss() {
  if (mode === "survival") {
    lives--;
    if (lives < 0) lives = 0;
    updateHearts();

    if (lives <= 0) {
      endGame("life");
    }
  }
  // En time-attack, rater ne fait que perdre l'occasion de marquer des points
}

// --- Lancer la reconnaissance vocale pour un mot ---
function startSpeechForWord(wordElement, word) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Ce navigateur ne supporte pas la reconnaissance vocale (Web Speech API).");
    return;
  }

  // Mettre le jeu en pause
  isPaused = true;
  isListening = true;

  // Afficher l'overlay micro
  showMicrophoneOverlay();
  wordElement.classList.add("listening");

  const recognition = new SpeechRecognition();
  recognition.lang = "fr-FR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;

    hideMicrophoneOverlay();

    if (isCorrectPronunciation(word, transcript)) {
      addScore(1);
      // Retirer le mot si correct
      clearInterval(wordElement.fallIntervalId);
      if (wordElement.parentNode) {
        gameArea.removeChild(wordElement);
      }
      showBigFeedback(true);
    } else {
      showBigFeedback(false);
      // Ici on ne retire pas de vie, juste pas de point
    }
    
    // Reprendre le jeu
    isPaused = false;
    isListening = false;
    wordElement.classList.remove("listening");
  };

  recognition.onerror = (event) => {
    console.error("Erreur reconnaissance vocale :", event.error);
    hideMicrophoneOverlay();
    isListening = false;
    isPaused = false;
    wordElement.classList.remove("listening");
    
    if (event.error === "not-allowed" || event.error === "permission-denied") {
      showFeedback("⚠️ Permission micro refusée. Vérifiez les paramètres du navigateur.");
    } else if (event.error === "no-speech") {
      showFeedback("⚠️ Aucune parole détectée, réessaie.");
    } else {
      showFeedback("⚠️ Erreur de reconnaissance, réessaie.");
    }
  };

  recognition.onend = () => {
    hideMicrophoneOverlay();
    isListening = false;
    isPaused = false;
    wordElement.classList.remove("listening");
  };

  recognition.start();
}

// --- Ajout de score ---
function addScore(points) {
  score += points;
  scoreSpan.textContent = score;
}

// --- Sauvegarde des scores ---
function recordLocalScore(game, mode, scoreValue) {
  const key = game === "alphabet" ? "alphabetScores" : "wordScores";
  const existing = JSON.parse(localStorage.getItem(key) || "[]");
  existing.push({
    game,
    mode,
    score: scoreValue,
    date: new Date().toISOString()
  });
  localStorage.setItem(key, JSON.stringify(existing));
}

function sendScoreToServer(game, mode, scoreValue) {
  const token = localStorage.getItem("token");
  if (!token) return;

  fetch("http://localhost:3000/scores", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ game, mode, score: scoreValue })
  }).catch((e) => console.error("Erreur envoi score:", e));
}

function persistScore(game, mode, scoreValue) {
  recordLocalScore(game, mode, scoreValue);
  sendScoreToServer(game, mode, scoreValue);
}

// --- Afficher l'overlay micro ---
function showMicrophoneOverlay() {
  let overlay = document.getElementById("microphone-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "microphone-overlay";
    overlay.innerHTML = `
      <div style="font-size: 80px; margin-bottom: 20px;">🎤</div>
      <div style="font-size: 24px; color: #fff;">Parlez maintenant...</div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = "flex";
}

// --- Masquer l'overlay micro ---
function hideMicrophoneOverlay() {
  const overlay = document.getElementById("microphone-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
}

// --- Affichage d'un grand message feedback ---
function showBigFeedback(isCorrect) {
  let feedback = document.getElementById("big-feedback");
  if (!feedback) {
    feedback = document.createElement("div");
    feedback.id = "big-feedback";
    document.body.appendChild(feedback);
  }
  
  if (isCorrect) {
    feedback.innerHTML = '<div style="font-size: 100px;">✅</div><div style="font-size: 48px; margin-top: 20px;">正解！</div>';
    feedback.style.background = "rgba(76, 175, 80, 0.95)";
  } else {
    feedback.innerHTML = '<div style="font-size: 100px;">❌</div><div style="font-size: 48px; margin-top: 20px;">不正解</div>';
    feedback.style.background = "rgba(244, 67, 54, 0.95)";
  }
  
  feedback.style.display = "flex";
  setTimeout(() => {
    feedback.style.display = "none";
  }, 2000);
}

// --- Affichage d'un petit message feedback (pour erreurs) ---
function showFeedback(text) {
  let fb = document.getElementById("speech-feedback");
  if (!fb) {
    fb = document.createElement("div");
    fb.id = "speech-feedback";
    document.body.appendChild(fb);
  }
  fb.textContent = text;
  fb.classList.add("show");
  setTimeout(() => {
    fb.classList.remove("show");
  }, 1200);
}

// --- Afficher l'écran de fin avec options ---
function showEndGameOverlay(message) {
  let overlay = document.getElementById("endgame-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "endgame-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0, 0, 0, 0.7)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "9999";

    const card = document.createElement("div");
    card.style.background = "#fff";
    card.style.borderRadius = "16px";
    card.style.padding = "24px";
    card.style.maxWidth = "420px";
    card.style.width = "90%";
    card.style.textAlign = "center";
    card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.2)";

    const title = document.createElement("div");
    title.id = "endgame-message";
    title.style.fontSize = "20px";
    title.style.fontWeight = "700";
    title.style.marginBottom = "18px";
    title.style.whiteSpace = "pre-line";

    const buttonRow = document.createElement("div");
    buttonRow.style.display = "flex";
    buttonRow.style.gap = "12px";
    buttonRow.style.justifyContent = "center";
    buttonRow.style.flexWrap = "wrap";

    const retryBtn = document.createElement("button");
    retryBtn.textContent = "もう一度";
    retryBtn.style.padding = "10px 18px";
    retryBtn.style.borderRadius = "999px";
    retryBtn.style.border = "none";
    retryBtn.style.cursor = "pointer";
    retryBtn.style.background = "#2c974b";
    retryBtn.style.color = "#fff";
    retryBtn.style.fontWeight = "600";
    retryBtn.addEventListener("click", () => {
      window.location.reload();
    });

    const quitBtn = document.createElement("button");
    quitBtn.textContent = "やめますか？";
    quitBtn.style.padding = "10px 18px";
    quitBtn.style.borderRadius = "999px";
    quitBtn.style.border = "none";
    quitBtn.style.cursor = "pointer";
    quitBtn.style.background = "#d93025";
    quitBtn.style.color = "#fff";
    quitBtn.style.fontWeight = "600";
    quitBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });

    buttonRow.appendChild(retryBtn);
    buttonRow.appendChild(quitBtn);
    card.appendChild(title);
    card.appendChild(buttonRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  const messageEl = document.getElementById("endgame-message");
  if (messageEl) {
    messageEl.textContent = message;
  }
  overlay.style.display = "flex";
}

// --- Fin de partie ---
function endGame(reason) {
  if (gameOver) return;
  gameOver = true;

  // Arrêter les timers globaux
  if (timerInterval) clearInterval(timerInterval);
  if (spawnInterval) clearInterval(spawnInterval);

  // Stopper et retirer tous les mots restants
  const words = document.querySelectorAll(".fall-letter");
  words.forEach(w => {
    if (w.fallIntervalId) clearInterval(w.fallIntervalId);
    w.remove();
  });

  persistScore(gameType, mode, score);

  let message = "";
  if (mode === "time-attack") {
    message += "時間切れです！\n";
  } else {
    message += "ゲームオーバー！\n";
  }
  message += `スコア：${score}`;

  showEndGameOverlay(message);
}

// --- Lancer le jeu ---
function startGame() {
  // Recharger la liste des mots au démarrage
  WORD_LIST = getSelectedWords();
  
  if (WORD_LIST.length === 0) {
    alert("単語が選択されていません。設定ページで単語を選択してください。");
    return;
  }

  initModeUI();

  // Création des mots régulièrement (ralenti : toutes les 3 secondes au lieu de 1.2s)
  const { spawnIntervalMs } = getSpeedConfig();
  spawnInterval = setInterval(() => {
    if (!isPaused && !gameOver) {
      spawnWord();
    }
  }, spawnIntervalMs);
}

// Démarrage une fois la page chargée
window.addEventListener("load", startGame);
