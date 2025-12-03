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

// ===== Достать JSON из текста =====
function extractJSON(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("JSON not found");
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

Память:
Дата: ${session.birthDate}
Время: ${session.birthTime}

ЗАДАЧА:
1. Посчитай основные числа.
2. Краткий анализ (до 3–4 предложений).
3. Карту дня — одно предложение.

СТРОГО JSON:
{
"numbers": {...},
"analysis": "...",
"dayCard": "..."
}
`;

        const response = await client.responses.create({
            model: "gpt-4.1-mini",
            input: prompt
        });

        const data = extractJSON(response.output_text);

        session.calculated = data;
        session.history.push(JSON.stringify(data).slice(0, 400));

        // ❗ ОТДАЁМ ТОЛЬКО НУЖНОЕ ПОЛЬЗОВАТЕЛЮ
        res.json({
            analysis: data.analysis || "",
            dayCard: data.dayCard || ""
        });

    } catch (err) {
        console.error("ANALYZE ERROR:", err);
        res.status(500).json({ error: "Ошибка обработки" });
    }
});



// ===============================
//        СОВМЕСТИМОСТЬ
// ===============================
app.post("/compatibility", async (req, res) => {
    try {
        const { userId, secondBirthDate } = req.body;
        const session = getSession(userId);

        // ❗ ЕСЛИ ПОЛЬЗОВАТЕЛЬ НЕ ВВЁЛ СВОЮ ДАТУ
        if (!session.birthDate) {
            return res.json({
                error: "no_birth_date",
                message: "Сначала заполните вашу дату рождения во вкладке 'Персональный разбор'."
            });
        }

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

        const data = extractJSON(response.output_text);

        session.history.push(JSON.stringify(data).slice(0, 500));

        // ❗ ОТДАЁМ ЧИСТЫЙ ТЕКСТ БЕЗ JSON-СКОБОК
        res.json({
            percent: data.percent,
            strengths: data.strengths,
            weaknesses: data.weaknesses,
            summary: data.summary
        });

    } catch (err) {
        console.error("COMPAT ERROR:", err);
        res.status(500).json({ error: "Ошибка" });
    }
});



// ===============================
//              ПИНГ
// ===============================
app.get("/", (req, res) => {
    res.send("Magic Serv OpenAI JSON-clean API up");
});



// ===== Render PORT =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
