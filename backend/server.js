const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const app = express();
app.use(cors());
app.use(express.json());

let db;

(async () => {
    db = await open({
        filename: "./burnout_data.db",
        driver: sqlite3.Database
    });
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS burnout_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            score INTEGER,
            level TEXT,
            switching_ratio REAL,
            color TEXT,
            face TEXT,
            local_time TEXT,
            explanation TEXT,
            work_impact REAL,
            switch_impact REAL,
            recovery_impact REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log("✅ Weekly Resonance Backend Online");
})();

function analyzeBurnout(workHours, taskCount, focusHours, breakFrequency) {
    const ratio = taskCount / (focusHours || 1);
    const workImpact = Math.min(35, workHours * 3.5);
    const switchImpact = Math.min(40, ratio * 12);
    const recoveryImpact = Math.max(5, 25 - (breakFrequency * 8));
    let score = Math.max(5, Math.min(100, Math.round(workImpact + switchImpact + recoveryImpact)));
    
    let primaryDriver = "Balanced";
    if (workImpact > switchImpact && workImpact > recoveryImpact) primaryDriver = "Work Volume";
    else if (switchImpact > workImpact && switchImpact > recoveryImpact) primaryDriver = "Task Switching";
    else primaryDriver = "Recovery Gap";

    let face, level, color;
    if (score > 75) { face = "😵"; level = "Critical"; color = "#ef4444"; }
    else if (score > 50) { face = "😰"; level = "High"; color = "#f97316"; }
    else { face = "😊"; level = "Optimal"; color = "#22c55e"; }
    
    return { score, face, level, color, switchingRatio: ratio, explanation: primaryDriver, contributions: { workImpact, switchImpact, recoveryImpact } };
}

app.post("/analyze", async (req, res) => {
    try {
        const { workHours, taskCount, focusHours, breakFrequency } = req.body;
        const result = analyzeBurnout(Number(workHours), Number(taskCount), Number(focusHours), Number(breakFrequency));
        const localTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        await db.run(
            `INSERT INTO burnout_logs 
            (score, level, switching_ratio, color, face, local_time, explanation, work_impact, switch_impact, recovery_impact) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [result.score, result.level, result.switchingRatio, result.color, result.face, localTime, result.explanation, result.contributions.workImpact, result.contributions.switchImpact, result.contributions.recoveryImpact]
        );
        res.json({...result, local_time: localTime});
    } catch (e) { res.status(500).json({ error: "DB Error" }); }
});

app.get("/analytics/weekly", async (req, res) => {
    // Aggregates average score per day for the last 7 days
    const data = await db.all(`
        SELECT 
            date(created_at) as day, 
            AVG(score) as avg_score 
        FROM burnout_logs 
        WHERE created_at > date('now', '-7 days')
        GROUP BY day 
        ORDER BY day ASC
    `);
    res.json(data);
});

app.get("/history", async (req, res) => {
    const logs = await db.all("SELECT * FROM burnout_logs ORDER BY id DESC LIMIT 6");
    res.json(logs);
});

app.listen(5000, "127.0.0.1");