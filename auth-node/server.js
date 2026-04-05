// server.js
const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const path = require("path");
const db = require("./db");
const jwt = require("jsonwebtoken");

const app = express();
app.use(bodyParser.json());
app.use(cors());

const SECRET = "monsecret123";

// --- Création des tables si besoin ---
db.query(
    `CREATE TABLE IF NOT EXISTS game_scores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        game VARCHAR(50) NOT NULL,
        mode VARCHAR(50) NOT NULL,
        score INT NOT NULL DEFAULT 0,
        played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_played_at (user_id, played_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
    (err) => {
        if (err) {
            console.error("Erreur SQL create game_scores:", err);
        }
    }
);

// --- Middleware d'authentification JWT ---
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
        return res.status(401).json({ message: "Token manquant" });
    }

    jwt.verify(token, SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: "Token invalide" });
        }
        req.user = decoded;
        next();
    });
}

/**
 * Schéma MySQL suggéré :
 *
 * CREATE TABLE IF NOT EXISTS words (
 *   id INT AUTO_INCREMENT PRIMARY KEY,
 *   fr VARCHAR(255) NOT NULL,
 *   pron VARCHAR(255) DEFAULT NULL,
 *   jp VARCHAR(255) NOT NULL,
 *   category VARCHAR(255) DEFAULT NULL,
 *   example TEXT,
 *   audio_url VARCHAR(500) DEFAULT NULL,
 *   attempts INT DEFAULT 0,
 *   success INT DEFAULT 0,
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
 */

// ROUTE : INSCRIPTION
app.post("/register", (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: "すべてのフィールドが必須です。" });
    }

    // Vérifier si l'email existe déjà
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, result) => {
        if (err) {
            console.error("Erreur SQL select email:", err);
            return res.status(500).json({ message: "Erreur serveur" });
        }

        if (result.length > 0) {
            return res.status(400).json({ message: "メールアドレスは既に使用されています" });
        }

        // Hash du mot de passe
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) throw err;

            db.query(
                "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
                [name, email, hash],
                (error, results) => {
                    if (error) {
                        console.error("Erreur SQL insert:", error);
                        return res.status(500).json({ message: "Erreur serveur" });
                    }

                    res.json({ message: "Inscription réussie" });
                }
            );
        });
    });
});

// ROUTE : CONNEXION
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, result) => {
        if (err) {
            console.error("Erreur SQL select login:", err);
            return res.status(500).json({ message: "Erreur serveur" });
        }

        if (result.length === 0) {
            return res.status(400).json({ message: "ユーザーが見つかりません" });
        }

        const user = result[0];

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (!isMatch) {
                return res.status(400).json({ message: "パスワードが間違っています" });
            }

            const token = jwt.sign(
                { id: user.id, email: user.email },
                SECRET,
                { expiresIn: "1h" }
            );

            res.json({
                message: "Connexion réussie",
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    score: user.score,
                    level: user.level
                }
            });
        });
    });
});

// -----------------------
//  API Mots (CRUD simple)
// -----------------------

// Liste des mots (tri côté client possible)
app.get("/words", (req, res) => {
    db.query("SELECT * FROM words ORDER BY id DESC", (err, result) => {
        if (err) {
            console.error("Erreur SQL select words:", err);
            return res.status(500).json({ message: "Erreur serveur" });
        }
        res.json(result);
    });
});

// Ajouter un mot
app.post("/words", (req, res) => {
    const { fr, pron, jp, category, example, audio_url } = req.body;
    if (!fr || !jp) {
        return res.status(400).json({ message: "フランス語と日本語は必須です。" });
    }
    db.query(
        "INSERT INTO words (fr, pron, jp, category, example, audio_url) VALUES (?, ?, ?, ?, ?, ?)",
        [fr, pron || null, jp, category || null, example || null, audio_url || null],
        (err, result) => {
            if (err) {
                console.error("Erreur SQL insert word:", err);
                return res.status(500).json({ message: "Erreur serveur" });
            }
            res.json({ success: true, id: result.insertId });
        }
    );
});

// Mettre à jour stats (tentatives / succès) d'un mot
app.patch("/words/:id/stats", (req, res) => {
    const { id } = req.params;
    const { attempts = 0, success = 0 } = req.body;
    db.query(
        "UPDATE words SET attempts = attempts + ?, success = success + ? WHERE id = ?",
        [attempts, success, id],
        (err) => {
            if (err) {
                console.error("Erreur SQL update stats:", err);
                return res.status(500).json({ message: "Erreur serveur" });
            }
            res.json({ success: true });
        }
    );
});

// Modifier un mot
app.put("/words/:id", (req, res) => {
    const { id } = req.params;
    const { fr, pron, jp, category, example, audio_url } = req.body;
    if (!fr || !jp) {
        return res.status(400).json({ message: "フランス語と日本語は必須です。" });
    }
    db.query(
        "UPDATE words SET fr = ?, pron = ?, jp = ?, category = ?, example = ?, audio_url = ? WHERE id = ?",
        [fr, pron || null, jp, category || null, example || null, audio_url || null, id],
        (err) => {
            if (err) {
                console.error("Erreur SQL update word:", err);
                return res.status(500).json({ message: "Erreur serveur" });
            }
            res.json({ success: true });
        }
    );
});

// Supprimer un mot
app.delete("/words/:id", (req, res) => {
    const { id } = req.params;
    db.query("DELETE FROM words WHERE id = ?", [id], (err) => {
        if (err) {
            console.error("Erreur SQL delete word:", err);
            return res.status(500).json({ message: "Erreur serveur" });
        }
        res.json({ success: true });
    });
});

// -----------------------
//  API Scores (progress)
// -----------------------

// Liste des scores du user connecté
app.get("/scores", authenticate, (req, res) => {
    db.query(
        "SELECT id, game, mode, score, played_at FROM game_scores WHERE user_id = ? ORDER BY played_at ASC",
        [req.user.id],
        (err, result) => {
            if (err) {
                console.error("Erreur SQL select scores:", err);
                return res.status(500).json({ message: "Erreur serveur" });
            }
            res.json(result);
        }
    );
});

// Ajouter un score
app.post("/scores", authenticate, (req, res) => {
    const { game, mode, score, playedAt } = req.body;
    const normalizedGame = game === "alphabet" || game === "word" ? game : null;
    const normalizedMode = mode === "time-attack" || mode === "survival" ? mode : null;
    const safeScore = Number.isFinite(Number(score)) ? Number(score) : null;

    if (!normalizedGame || !normalizedMode || safeScore === null) {
        return res.status(400).json({ message: "Paramètres invalides" });
    }

    const playedAtValue = playedAt ? new Date(playedAt) : new Date();

    db.query(
        "INSERT INTO game_scores (user_id, game, mode, score, played_at) VALUES (?, ?, ?, ?, ?)",
        [req.user.id, normalizedGame, normalizedMode, safeScore, playedAtValue],
        (err, result) => {
            if (err) {
                console.error("Erreur SQL insert score:", err);
                return res.status(500).json({ message: "Erreur serveur" });
            }
            res.json({ success: true, id: result.insertId });
        }
    );
});

// Servir les fichiers statiques (HTML, CSS, JS, images) depuis le dossier parent
// IMPORTANT : Placer après les routes API pour éviter les conflits
app.use(express.static(path.join(__dirname, "..")));

// LANCEMENT DU SERVEUR
app.listen(3000, () => {
    console.log("Serveur lancé sur http://localhost:3000");
    console.log("Accédez à l'application via : http://localhost:3000/index.html");
});
