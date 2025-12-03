import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import https from "https";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json());

// ===== SSL FIX (ОБЯЗАТЕЛЬНО ДЛЯ RENDER) =====
const agent = new https.Agent({
    rejectUnauthorized: false
});

// ===== ГИГАЧАТ НАСТРОЙКИ =====
const CLIENT_ID = process.env.GIGACHAT_CLIENT_ID;
const CLIENT_SECRET = process.env.GIGACHAT_CLIENT_SECRET;
const SCOPE = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";


// ===== Получение токена =====
async function getAccessToken() {
    const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

    const resp = await fetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
        method: "POST",
        agent,
        headers: {
            Authorization: `Basic ${creds}`,
            RqUID: crypto.randomUUID(),
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: `scope=${SCOPE}`
    });

    const data = await resp.json();

    if (!data.access_token) {
        throw new Error("Не получил токен: " + JSON.stringify(data));
    }

    return data.access_token;
}


// ===== Запрос к модели =====
async function giga(prompt) {
    const token = await getAccessToken();

    const resp = await fetch("https://gigachat.devices.sberbank.ru/api/v1/chat/completions", {
        method: "POST",
        agent,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            model: "Gigachat",
            messages: [
                { role: "user", content: prompt }
            ]
        })
    });

    const data = await resp.json();

    if (!data.choices) {
        console.log("GigaChat raw:", data);
        throw new Error("GigaChat bad response: " + JSON.stringify(data));
    }

    return data.choices[0].message.content;
}



// ===== ПАМЯТЬ ПОЛЬЗОВАТЕЛЕЙ =====
const sessions = {};

function getSession(id) {
    if (!sessions[id]) {
        sessions[id] = {
            birthDate: null,
            birthTime: null,
            calculated: {},
            history: []
        };
    }
    return sessions[id];
}



// ===============================
//      ПЕРСОНАЛЬНЫЙ РАЗБОР
// ===============================
app.post("/analyze", async (req, res) => {
    try {
        const { userId, birthDate, birthTime } = req.body;
        const session = getSession(userId);

        if (birthDate) session.birthDate = birthDate;
        if (birthTime) session.birthTime = birthTime;

        const prompt = `
Ты — астролог/нумеролог. Верни строго JSON.

ПАМЯТЬ:
Дата рождения: ${session.birthDate}
Время: ${session.birthTime}

ПРЕДЫДУЩИЕ ДАННЫЕ:
${JSON.stringify(session.calculated)}

ИСТОРИЯ:
${session.history.join("\n")}

ЗАДАЧА:
1. Посчитай основные числа.
2. Дай краткий разбор.
3. Дай карту дня.

СТРОГО JSON:
{
"numbers": {...},
"analysis": "...",
"dayCard": "..."
}
        `;

        const raw = await giga(prompt);

        // вытаскиваем JSON из текста
        const jsonStart = raw.indexOf("{");
        const jsonEnd = raw.lastIndexOf("}");
        const jsonString = raw.slice(jsonStart, jsonEnd + 1);

        const data = JSON.parse(jsonString);

        session.calculated = data;
        session.history.push(JSON.stringify(data).slice(0, 500));

        res.json(data);

    } catch (err) {
        console.error("ANALYZE ERROR:", err);
        res.status(500).json({ error: "Ошибка обработки", details: String(err) });
    }
});



// ===============================
//         СОВМЕСТИМОСТЬ
// ===============================
app.post("/compatibility", async (req, res) => {
    try {
        const { userId, secondBirthDate } = req.body;
        const session = getSession(userId);

        const prompt = `
Ты — эксперт по совместимости. Верни строго JSON.

Пользователь: ${session.birthDate}
Партнёр: ${secondBirthDate}

СТРОГО JSON:
{
"percent": 0-100,
"strengths": "...",
"weaknesses": "...",
"summary": "..."
}
        `;

        const raw = await giga(prompt);

        const jsonStart = raw.indexOf("{");
        const jsonEnd = raw.lastIndexOf("}");
        const jsonString = raw.slice(jsonStart, jsonEnd + 1);

        const data = JSON.parse(jsonString);

        session.history.push(JSON.stringify(data).slice(0, 500));

        res.json(data);

    } catch (err) {
        console.error("COMPAT ERROR:", err);
        res.status(500).json({ error: "Ошибка", details: String(err) });
    }
});



// ===============================
//            ПИНГ
// ===============================
app.get("/", (req, res) => {
    res.send("Magic Serv GigaChat API up");
});


// ===== Render PORT FIX =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
