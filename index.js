import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
    apiKey: process.env.OPENAI_KEY
});

// ===== ПАМЯТЬ =====
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


// ===== ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ — ВЫДЕРНУТЬ JSON ИЗ ТЕКСТА =====
function extractJSON(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
        throw new Error("JSON not found in model output");
    }
    return JSON.parse(text.slice(start, end + 1));
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
Время рождения: ${session.birthTime}

ПРЕДЫДУЩИЕ РЕЗУЛЬТАТЫ:
${JSON.stringify(session.calculated)}

ИСТОРИЯ GPT:
${session.history.join("\n")}

ЗАДАЧА:
1. Посчитай основные числа.
2. Дай краткое описание.
3. Дай карту дня.

СТРОГО JSON:
{
"numbers": {...},
"analysis": "...",
"dayCard": "..."
}
`;

        // ===== GPT ВОЗВРАЩАЕТ ТЕКСТ — БЕЗ ФОРМАТОВ =====
        const response = await client.responses.create({
            model: "gpt-4.1-mini",
            input: prompt
        });

        const rawText = response.output_text;
        const data = extractJSON(rawText);

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

        const response = await client.responses.create({
            model: "gpt-4.1-mini",
            input: prompt
        });

        const rawText = response.output_text;
        const data = extractJSON(rawText);

        session.history.push(JSON.stringify(data).slice(0, 500));

        res.json(data);

    } catch (err) {
        console.error("COMPAT ERROR:", err);
        res.status(500).json({ error: "Ошибка", details: String(err) });
    }
});



// ===============================
//             ПИНГ
// ===============================
app.get("/", (req, res) => {
    res.send("Magic Serv OpenAI JSON-safe API up");
});


// ===== Render PORT FIX =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
