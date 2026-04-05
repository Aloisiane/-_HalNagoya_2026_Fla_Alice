// db.js
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root", // change si besoin
    database: "auth_db"
});

db.connect((err) => {
    if (err) {
        console.error("Erreur connexion MySQL :", err);
        return;
    }
    console.log("Connexion MySQL réussie !");
});

module.exports = db;
