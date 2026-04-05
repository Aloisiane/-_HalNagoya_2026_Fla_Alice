// javascript/alphabetGame.js

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
const gameType = "alphabet";

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
  const speedValue = Number(settings.alphabetSpeed) || 3;

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

// --- Table des noms français des lettres ---
const LETTER_NAMES_FR = {
  A: ["a"],
  B: ["bé", "be", "bay"],
  C: ["cé", "ce", "say"],
  D: ["dé", "de", "day"],
  E: ["e", "eu"],
  F: ["effe", "f"],
  G: ["gé", "je", "jay"],
  H: ["hache"],
  I: ["i"],
  J: ["ji", "j"],
  K: ["ka"],
  L: ["elle", "l"],
  M: ["emme", "m"],
  N: ["enne", "n"],
  O: ["o"],
  P: ["pé", "pe", "pay"],
  Q: ["q", "ku"],
  R: ["erre", "r"],
  S: ["esse", "s"],
  T: ["té", "te", "tay"],
  U: ["u"],
  V: ["vé", "ve", "vay"],
  W: ["double vé", "double v", "w"],
  X: ["x", "iks"],
  Y: ["y", "i grec"],
  Z: ["z", "zède", "zed"]
};

// --- Fonctions utilitaires pour la reconnaissance ---

// Supprimer accents et mettre en minuscule
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .trim();
}

// Vérifier si le texte reconnu correspond à la lettre
function isCorrectPronunciation(letter, recognizedText) {
  if (!recognizedText) {
    console.log("isCorrectPronunciation: recognizedText est vide");
    return false;
  }

  let txt = normalize(recognizedText);
  console.log(`Texte normalisé: "${txt}"`);

  // On ne garde que le premier mot (au cas où la phrase soit longue)
  txt = txt.split(/\s+/)[0];
  console.log(`Premier mot: "${txt}"`);

  const letterUpper = letter.toUpperCase();
  const expectedList = LETTER_NAMES_FR[letterUpper];
  if (!expectedList) {
    console.warn(`Aucune prononciation attendue pour la lettre: ${letterUpper}`);
    return false;
  }

  console.log(`Prononciations attendues pour ${letterUpper}:`, expectedList);

  // Vérifier si le texte normalisé correspond à une des prononciations attendues
  const matches = expectedList.some(name => {
    const normalizedName = normalize(name);
    const exactMatch = normalizedName === txt;
    // Pour les mots courts (1-2 caractères), on accepte aussi si le texte reconnu commence par la prononciation
    const startsWithMatch = txt.length <= 3 && txt.startsWith(normalizedName);
    const partialMatch = txt.length > 3 && (txt.includes(normalizedName) || normalizedName.includes(txt));
    const result = exactMatch || startsWithMatch || partialMatch;
    console.log(`  - "${normalizedName}" vs "${txt}": exact=${exactMatch}, startsWith=${startsWithMatch}, partial=${partialMatch}, result=${result}`);
    return result;
  });
  
  console.log(`Résultat final pour ${letterUpper}: ${matches}`);
  
  return matches;
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

// --- Création d'une lettre qui tombe ---
function spawnLetter() {
  if (gameOver) return;

  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z

  const letterDiv = document.createElement("div");
  letterDiv.className = "fall-letter";
  letterDiv.textContent = letter;

  const areaWidth = gameArea.clientWidth || 400;
  const x = Math.random() * (areaWidth - 40); // 40 = largeur approximative
  letterDiv.style.left = x + "px";
  letterDiv.style.top = "-40px";

  // Ajout au DOM
  gameArea.appendChild(letterDiv);

  // Mouvement vers le bas
  let top = -40;
  const { fallSpeed } = getSpeedConfig(); // pixels par tick
  letterDiv.fallIntervalId = setInterval(() => {
    if (gameOver || isPaused) {
      return; // Ne pas supprimer l'intervalle, juste ne pas bouger
    }

    top += fallSpeed;
    letterDiv.style.top = top + "px";

    if (top > gameArea.clientHeight) {
      // La lettre a touché le bas
      clearInterval(letterDiv.fallIntervalId);
      if (letterDiv.parentNode) {
        gameArea.removeChild(letterDiv);
      }
      onMiss();
    }
  }, 20);

  // Clic sur la lettre = lancer la reconnaissance vocale
  letterDiv.addEventListener("click", () => {
    if (gameOver || isListening || isPaused) return;
    startSpeechForLetter(letterDiv, letter);
  });
}

// --- Quand le joueur rate une lettre (elle tombe en bas) ---
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

// --- Lancer la reconnaissance vocale pour une lettre ---
function startSpeechForLetter(letterElement, letter) {
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
  letterElement.classList.add("listening");

  const recognition = new SpeechRecognition();
  recognition.lang = "fr-FR";
  recognition.interimResults = false; // Pas de résultats intermédiaires
  recognition.maxAlternatives = 1;
  recognition.continuous = true; // Continue à écouter jusqu'à ce qu'on l'arrête manuellement
  
  // Variable pour savoir si onresult a été appelé
  let resultReceived = false;
  let feedbackShown = false;

  // Timeout pour éviter que la reconnaissance écoute indéfiniment
  let timeoutId = setTimeout(() => {
    if (isListening && !resultReceived) {
      console.log("Timeout - arrêt de la reconnaissance après 3 secondes");
      recognition.stop();
      hideMicrophoneOverlay();
      isListening = false;
      isPaused = false;
      letterElement.classList.remove("listening");
      if (!feedbackShown) {
        showBigFeedback(false);
        feedbackShown = true;
      }
    }
  }, 3000); // 3 secondes maximum

  recognition.onresult = (event) => {
    console.log("=== onresult déclenché ===");
    
    if (!event.results || event.results.length === 0) {
      console.error("Aucun résultat dans l'événement");
      return; // Continuer à écouter
    }
    
    // Avec continuous=true, on prend le dernier résultat (le plus récent)
    const resultIndex = event.results.length - 1;
    const result = event.results[resultIndex];
    
    // Vérifier si le résultat est final
    if (!result.isFinal) {
      console.log("Résultat non final, on attend...");
      return; // Attendre le résultat final
    }
    
    const transcript = result[0].transcript;
    
    // Vérifier que le transcript n'est pas vide
    if (!transcript || transcript.trim() === "") {
      console.log("Transcript vide, on continue à écouter...");
      return; // Continuer à écouter
    }
    
    // On a un résultat valide, arrêter la reconnaissance
    resultReceived = true;
    clearTimeout(timeoutId); // Annuler le timeout
    recognition.stop();
    
    // Debug : afficher ce qui a été reconnu
    console.log(`Lettre attendue: ${letter}, Reconnu: "${transcript}"`);

    try {
      hideMicrophoneOverlay();

      const isCorrect = isCorrectPronunciation(letter, transcript);
      console.log(`Résultat: ${isCorrect ? "CORRECT" : "INCORRECT"}`);

      if (isCorrect) {
        console.log("Traitement du résultat CORRECT...");
        addScore(1);
        // Retirer la lettre si correct
        clearInterval(letterElement.fallIntervalId);
        if (letterElement.parentNode) {
          gameArea.removeChild(letterElement);
        }
        console.log("Affichage du feedback correct...");
        showBigFeedback(true);
        console.log("Feedback correct affiché");
      } else {
        console.log("Traitement du résultat INCORRECT...");
        showBigFeedback(false);
        // Ici on ne retire pas de vie, juste pas de point
      }
      
      // Reprendre le jeu
      isPaused = false;
      isListening = false;
      letterElement.classList.remove("listening");
      console.log("=== Fin onresult ===");
    } catch (error) {
      console.error("Erreur dans onresult:", error);
      if (typeof timeoutId !== 'undefined') clearTimeout(timeoutId); // Annuler le timeout en cas d'erreur
      hideMicrophoneOverlay();
      isPaused = false;
      isListening = false;
      letterElement.classList.remove("listening");
    }
  };

  recognition.onerror = (event) => {
    clearTimeout(timeoutId); // Annuler le timeout en cas d'erreur
    console.error("=== Erreur reconnaissance vocale ===");
    console.error("Type d'erreur:", event.error);
    console.error("Event complet:", event);
    hideMicrophoneOverlay();
    isListening = false;
    isPaused = false;
    letterElement.classList.remove("listening");
    
    if (event.error === "not-allowed" || event.error === "permission-denied") {
      showFeedback("⚠️ Permission micro refusée. Vérifiez les paramètres du navigateur.");
    } else if (event.error === "no-speech") {
      console.log("Aucune parole détectée - réessayez en parlant plus fort");
      showFeedback("⚠️ Aucune parole détectée. Parlez plus fort et réessayez.");
    } else {
      showFeedback("⚠️ Erreur de reconnaissance, réessaie.");
    }
  };

  recognition.onend = () => {
    clearTimeout(timeoutId); // Annuler le timeout
    console.log("=== onend déclenché ===");
    console.log("resultReceived:", resultReceived);
    
    // Si onend est appelé sans onresult, cela signifie qu'aucune parole n'a été détectée
    if (!resultReceived && isListening) {
      console.log("Aucune parole détectée - la reconnaissance s'est terminée sans résultat");
      hideMicrophoneOverlay();
      isListening = false;
      isPaused = false;
      letterElement.classList.remove("listening");
      if (!feedbackShown) {
        showBigFeedback(false);
        feedbackShown = true;
      }
    } else if (resultReceived) {
      // onresult a déjà été appelé, on ne fait rien de plus
      console.log("onend appelé après onresult - normal");
    }
  };

  console.log(`Démarrage de la reconnaissance pour la lettre: ${letter}`);
  
  try {
    recognition.start();
    console.log("Reconnaissance démarrée");
  } catch (error) {
    console.error("Erreur au démarrage de la reconnaissance:", error);
    hideMicrophoneOverlay();
    isListening = false;
    isPaused = false;
    letterElement.classList.remove("listening");
    showFeedback("⚠️ Impossible de démarrer la reconnaissance vocale.");
  }
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

  // Stopper et retirer toutes les lettres restantes
  const letters = document.querySelectorAll(".fall-letter");
  letters.forEach(l => {
    if (l.fallIntervalId) clearInterval(l.fallIntervalId);
    l.remove();
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
  initModeUI();

  // Création des lettres régulièrement (ralenti : toutes les 3 secondes au lieu de 1.2s)
  const { spawnIntervalMs } = getSpeedConfig();
  spawnInterval = setInterval(() => {
    if (!isPaused && !gameOver) {
      spawnLetter();
    }
  }, spawnIntervalMs);

  // On n'utilise plus le clavier, tout se fait au clic + voix
}

// Démarrage une fois la page chargée
window.addEventListener("load", startGame);
