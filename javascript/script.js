//jeu Alphabet


const gameArea = document.getElementById('game-area');
const scoreDisplay = document.getElementById('score');
const livesDisplay = document.getElementById('lives');

let score = 0;
let lives = 3;

function randomLetter() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return alphabet[Math.floor(Math.random() * alphabet.length)];
}

function createLetter() {
  const letter = document.createElement('div');
  letter.classList.add('letter');
  letter.textContent = randomLetter();
  letter.style.left = Math.random() * 90 + '%';
  gameArea.appendChild(letter);

  letter.addEventListener('click', () => {
    recognizeSpeech(letter.textContent);
    letter.remove();
  });

  // Supprimer la lettre si elle atteint le bas
  setTimeout(() => {
    if (gameArea.contains(letter)) {
      gameArea.removeChild(letter);
    }
  }, 5000);
}

setInterval(createLetter, 1500);

// 🎤 Reconnaissance vocale
function recognizeSpeech(expectedLetter) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("La reconnaissance vocale n'est pas supportée sur ce navigateur.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.start();

  recognition.onresult = (event) => {
    const said = event.results[0][0].transcript.trim().toUpperCase();
    console.log("Tu as dit :", said);
    if (said === expectedLetter) {
      score += 10;
    } else {
      lives -= 1;
    }
    updateDisplay();
  };
}

function updateDisplay() {
  scoreDisplay.textContent = score;
  livesDisplay.textContent = lives;
  if (lives <= 0) {
    alert("Jeu terminé ! Ton score : " + score);
    window.location.reload();
  }
}
