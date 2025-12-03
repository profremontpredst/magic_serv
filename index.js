import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
    apiKey: process.env.OPENAI_KEY
});

// Память по пользователю (в демке — просто объект)
const sessions = {};

// Получаем или создаём сессию
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

// ====== 1) ПЕРСОНАЛЬНЫЙ РАЗБОР ======
app.post("/analyze", async (req, res) => {
    try {
        const { userId, birthDate, birthTime } = req.body;
        const session = getSession(userId);

        // сохраняем входные данные в сессию
        if (birthDate) session.birthDate = birthDate;
        if (birthTime) session.birthTime = birthTime;

        // промт для GPT
        const prompt = `
Ты — астролог/нумеролог, делаешь краткие и уверенные разборы.

ПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ:
Дата рождения: ${session.birthDate || "не указана"}
Время рождения: ${session.birthTime || "не указано"}

ПРЕДЫДУЩИЕ РЕЗУЛЬТАТЫ:
${JSON.stringify(session.calculated)}

ИСТОРИЯ ОТВЕТОВ GPT:
${session.history.join("\n")}

ЗАДАЧА:
1. Посчитай основные числа (жизненный путь, судьба, душа).
2. Дай краткий разбор (до 500 символов).
3. Определи карту дня.
4. Ответ должен быть структурирован короткими блоками.

Верни JSON с ключами:
- numbers
- analysis
- dayCard
        `;

        const response = await client.responses.create({
            model: "gpt-4.1-mini",
            input: prompt,
            format: "json"
        });

        const data = response.output[0];

        // сохраняем в память
        session.calculated = data;
        session.history.push(JSON.stringify(data).slice(0, 500));

        res.json(data);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка обработки" });
    }
});

// ====== 2) СОВМЕСТИМОСТЬ ======
app.post("/compatibility", async (req, res) => {
    try {
        const { userId, secondBirthDate } = req.body;
        const session = getSession(userId);

        const prompt = `
Ты — эксперт по совместимости.

ПОЛЬЗОВАТЕЛЬ:
Дата рождения: ${session.birthDate}
Накопленные данные: ${JSON.stringify(session.calculated)}

ПАРТНЕР:
Дата рождения: ${secondBirthDate}

СДЕЛАЙ:
- расчёт совместимости
- краткий прогноз (до 400 символов)
- сильные и слабые стороны пары

Верни JSON:
- percent
- strengths
- weaknesses
- summary
        `;

        const resp = await client.responses.create({
            model: "gpt-4.1-mini",
            input: prompt,
            format: "json"
        });

        const data = resp.output[0];
        session.history.push("compat:" + JSON.stringify(data).slice(0, 500));

        res.json(data);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка" });
    }
});

app.get("/", (req, res) => {
    res.send("Magic Serv API up");
});

app.listen(3000, () => console.log("Server running on 3000"));
