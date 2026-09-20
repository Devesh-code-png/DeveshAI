const express = require("express");
const OpenAI = require("openai");
const path = require("path");

const app = express();

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(express.static(__dirname));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const CHAT_MODEL = process.env.OPENAI_MODEL;
const IMAGE_MODEL = "gpt-image-2";
const VIDEO_MODEL = process.env.OPENAI_VIDEO_MODEL || "sora-2";

/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  res.json({
    status: "DeveshAI is running"
  });
});

/* =========================
   CHAT
========================= */

app.post("/api/chat", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing on the server."
      });
    }

    if (!CHAT_MODEL) {
      return res.status(500).json({
        error: "OPENAI_MODEL is missing on the server."
      });
    }

    const messages = Array.isArray(req.body.messages)
      ? req.body.messages
      : [];

    if (messages.length === 0) {
      return res.status(400).json({
        error: "No messages were provided."
      });
    }

    const response = await client.responses.create({
      model: CHAT_MODEL,
      instructions: `
You are DeveshAI.

You are a helpful, intelligent and friendly AI assistant.

Rules:
- If the user speaks Hinglish, reply in easy Hinglish.
- If the user speaks Hindi, reply in Hindi.
- If the user asks for simple explanations, explain step-by-step.
- Be concise when appropriate.
- Never reveal API keys or private server information.
      `,
      input: messages.slice(-30),
      store: false
    });

    res.json({
      reply:
        response.output_text ||
        "Sorry, I couldn't generate a response."
    });

  } catch (error) {
    console.error("CHAT ERROR:", error);

    res.status(500).json({
      error:
        error?.message ||
        "AI server error. Please try again."
    });
  }
});

/* =========================
   IMAGE GENERATION
========================= */

app.post("/api/image", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing on the server."
      });
    }

    const prompt = String(req.body.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        error: "Image prompt is required."
      });
    }

    const result = await client.images.generate({
      model: IMAGE_MODEL,
      prompt: prompt,
      size: req.body.size || "1024x1024",
      quality: req.body.quality || "auto",
      background: req.body.background || "auto",
      output_format: "png"
    });

    const image = result?.data?.[0];

    if (!image) {
      return res.status(500).json({
        error: "No image was returned."
      });
    }

    res.json({
      image_base64: image.b64_json || null,
      image_url: image.url || null
    });

  } catch (error) {
    console.error("IMAGE ERROR:", error);

    res.status(500).json({
      error:
        error?.message ||
        "Image generation failed."
    });
  }
});

/* =========================
   VIDEO GENERATION
========================= */

app.post("/api/video", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing on the server."
      });
    }

    const prompt = String(req.body.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        error: "Video prompt is required."
      });
    }

    const model = req.body.model || VIDEO_MODEL;
    const seconds = String(req.body.seconds || "4");
    const size = req.body.size || "1280x720";

    const video = await client.videos.create({
      model,
      prompt,
      seconds,
      size
    });

    res.json({
      id: video.id,
      status: video.status,
      progress: video.progress || 0,
      model: video.model,
      seconds: video.seconds,
      size: video.size
    });

  } catch (error) {
    console.error("VIDEO CREATE ERROR:", error);

    res.status(500).json({
      error:
        error?.message ||
        "Video generation failed."
    });
  }
});

/* =========================
   VIDEO STATUS
========================= */

app.get("/api/video/:id", async (req, res) => {
  try {
    const video = await client.videos.retrieve(req.params.id);

    res.json({
      id: video.id,
      status: video.status,
      progress: video.progress || 0,
      error: video.error || null,
      model: video.model,
      seconds: video.seconds,
      size: video.size
    });

  } catch (error) {
    console.error("VIDEO STATUS ERROR:", error);

    res.status(500).json({
      error:
        error?.message ||
        "Could not check video status."
    });
  }
});

/* =========================
   VIDEO DOWNLOAD
========================= */

app.get("/api/video/:id/content", async (req, res) => {
  try {
    const video = await client.videos.retrieve(req.params.id);

    if (video.status !== "completed") {
      return res.status(400).json({
        error: "Video is not completed yet."
      });
    }

    const content = await client.videos.downloadContent(
      req.params.id
    );

    const buffer = Buffer.from(
      await content.arrayBuffer()
    );

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="deveshai-${req.params.id}.mp4"`
    );

    res.send(buffer);

  } catch (error) {
    console.error("VIDEO DOWNLOAD ERROR:", error);

    res.status(500).json({
      error:
        error?.message ||
        "Could not download video."
    });
  }
});

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =========================
   404
========================= */

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found."
  });
});

/* =========================
   ERROR HANDLER
========================= */

app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error);

  res.status(500).json({
    error: "Internal server error."
  });
});

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`DeveshAI server running on port ${PORT}`);
});
