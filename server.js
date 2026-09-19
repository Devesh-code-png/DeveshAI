const express = require("express");
const OpenAI = require("openai");

const app = express();

app.use(express.json());

app.use(express.static(__dirname));

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL;

app.post("/api/chat", async (req, res) => {

    try {

        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({
                error: "OPENAI_API_KEY is missing."
            });
        }

        if (!MODEL) {
            return res.status(500).json({
                error: "OPENAI_MODEL is missing."
            });
        }

        const messages = req.body.messages || [];

        const response = await client.responses.create({

            model: MODEL,

            instructions:
                "You are DeveshAI, a helpful and friendly AI assistant. " +
                "Answer clearly and naturally. " +
                "If the user speaks Hinglish, reply in easy Hinglish.",

            input: messages.slice(-30)

        });

        res.json({
            reply: response.output_text
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "AI server error."
        });

    }

});

app.get("/health", (req, res) => {

    res.json({
        status: "DeveshAI is running"
    });

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        "DeveshAI server running on port " + PORT
    );

});