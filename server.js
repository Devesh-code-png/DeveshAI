```js
const express = require("express");
const OpenAI = require("openai");
const path = require("path");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const XLSX = require("xlsx");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6";

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(express.static(__dirname));

const upload = multer({
  dest: "/tmp/deveshai-uploads/",
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is missing.");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  res.json({
    status: "DeveshAI is running",
    ai: Boolean(process.env.OPENAI_API_KEY),
    model: MODEL
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

    const messages = Array.isArray(req.body.messages)
      ? req.body.messages
      : [];

    if (!messages.length) {
      return res.status(400).json({
        error: "No messages were provided."
      });
    }

    const mode = req.body.mode || "Ask";

    const modeInstructions = {
      Ask:
        "Answer naturally and helpfully.",

      Think:
        "Give careful reasoning and verify important details. Do not expose private chain-of-thought.",

      Study:
        "Teach step-by-step in simple language. Use examples and short sections.",

      Code:
        "Act as a programming assistant. Provide correct, practical code.",

      Create:
        "Help create high-quality original content and creative work.",

      Analyze:
        "Analyze information carefully and organize the result clearly.",

      Research:
        "Give a structured research-oriented answer and distinguish facts from uncertainty."
    };

    const instruction =
      modeInstructions[mode] ||
      modeInstructions.Ask;

    const systemPrompt = `
You are DeveshAI.

You are a helpful, intelligent and friendly AI assistant.

Current mode:
${mode}

Mode behavior:
${instruction}

Rules:

- If the user speaks Hinglish, reply in easy Hinglish.
- If the user speaks Hindi, reply in Hindi.
- Explain difficult topics step-by-step.
- Use headings and bullets when useful.
- Be concise when a short answer is enough.
- Be detailed when the user asks for detail.
- Never pretend an unavailable tool was used.
- Never invent search results, files, links, API results or actions.
- Never reveal API keys or private server information.
- Do not expose private chain-of-thought.
- For programming questions, provide working code whenever possible.
- For school questions, keep explanations simple and exam-friendly.
- Respect safety requirements.
`;

    const cleanMessages = messages
      .slice(-30)
      .map(message => ({
        role:
          message.role === "assistant"
            ? "assistant"
            : "user",
        content: String(message.content || "")
      }));

    const response = await client.responses.create({
      model: MODEL,
      instructions: systemPrompt,
      input: cleanMessages,
      store: false
    });

    const reply =
      response.output_text ||
      "Sorry, I couldn't generate a response.";

    res.json({ reply });

  } catch (error) {
    console.error("DeveshAI Chat Error:", error);

    res.status(500).json({
      error:
        error?.message ||
        "AI server error."
    });
  }
});


/* =========================
   FILE ANALYSIS
========================= */

app.post(
  "/api/files/analyze",
  upload.single("file"),
  async (req, res) => {

    let filePath = null;

    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          error: "OPENAI_API_KEY is missing."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "No file was uploaded."
        });
      }

      filePath = req.file.path;

      const originalName = req.file.originalname || "uploaded-file";
      const extension =
        path.extname(originalName).toLowerCase();

      let extractedText = "";

      /* ---------- TXT / CSV ---------- */

      if (
        extension === ".txt" ||
        extension === ".csv"
      ) {
        extractedText = fs.readFileSync(
          filePath,
          "utf8"
        );
      }

      /* ---------- PDF ---------- */

      else if (extension === ".pdf") {
        const buffer = fs.readFileSync(filePath);

        const pdf = await pdfParse(buffer);

        extractedText =
          pdf.text || "";
      }

      /* ---------- DOCX ---------- */

      else if (extension === ".docx") {
        const result =
          await mammoth.extractRawText({
            path: filePath
          });

        extractedText =
          result.value || "";
      }

      /* ---------- XLSX / XLS ---------- */

      else if (
        extension === ".xlsx" ||
        extension === ".xls"
      ) {
        const workbook =
          XLSX.readFile(filePath);

        const sheets = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet =
            workbook.Sheets[sheetName];

          const csv =
            XLSX.utils.sheet_to_csv(sheet);

          sheets.push(
            `SHEET: ${sheetName}\n${csv}`
          );
        }

        extractedText =
          sheets.join("\n\n");
      }

      else {
        return res.status(400).json({
          error:
            "Unsupported file type. Supported: PDF, DOCX, TXT, CSV, XLSX and XLS."
        });
      }

      if (!extractedText.trim()) {
        return res.status(400).json({
          error:
            "The file contains no readable text."
        });
      }

      /*
       * Prevent accidentally sending an enormous document
       * in one request.
       */
      const MAX_CHARS = 120000;

      const shortenedText =
        extractedText.length > MAX_CHARS
          ? extractedText.slice(0, MAX_CHARS) +
            "\n\n[Document truncated because it is very large.]"
          : extractedText;

      const question =
        String(
          req.body.question ||
          "Analyze this file and explain its important contents clearly."
        );

      const prompt = `
The user uploaded a file.

File name:
${originalName}

User's request:
${question}

File contents:
----------------
${shortenedText}
----------------

Analyze the file carefully.

If appropriate:
- summarize it
- answer the user's question
- identify important information
- explain difficult parts
- mention important numbers or tables
- point out uncertainty
- do not invent information that is not present
`;

      const response =
        await client.responses.create({
          model: MODEL,
          input: prompt,
          store: false
        });

      const reply =
        response.output_text ||
        "I could not analyze this file.";

      res.json({
        success: true,
        fileName: originalName,
        reply
      });

    } catch (error) {
      console.error(
        "DeveshAI File Analysis Error:",
        error
      );

      res.status(500).json({
        error:
          error?.message ||
          "File analysis failed."
      });

    } finally {

      if (filePath) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }

    }
  }
);


/* =========================
   IMAGE ENDPOINT
========================= */

app.post("/api/image", async (req, res) => {
  try {

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error:
          "OPENAI_API_KEY is missing."
      });
    }

    const prompt =
      String(req.body.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        error:
          "Image prompt is required."
      });
    }

    return res.status(501).json({
      error:
        "Image generation is not connected yet."
    });

  } catch (error) {

    console.error(
      "Image API Error:",
      error
    );

    res.status(500).json({
      error:
        error?.message ||
        "Image generation server error."
    });
  }
});


/* =========================
   WEB SEARCH PLACEHOLDER
========================= */

app.post("/api/search", async (req, res) => {

  res.status(501).json({
    error:
      "Web search backend will be connected in the next update."
  });

});


/* =========================
   PROJECTS PLACEHOLDER
========================= */

app.post("/api/projects", async (req, res) => {

  res.status(501).json({
    error:
      "Projects backend will be connected in the next update."
  });

});


/* =========================
   HOME
========================= */

app.get("/", (req, res) => {

  res.sendFile(
    path.join(__dirname, "index.html")
  );

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

  console.error(
    "Server Error:",
    error
  );

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    error:
      error?.message ||
      "Internal server error."
  });

});


/* =========================
   START
========================= */

app.listen(PORT, () => {

  console.log("--------------------------------");
  console.log("DeveshAI server started");
  console.log(`Port: ${PORT}`);
  console.log(`Model: ${MODEL}`);

  console.log(
    `API Key: ${
      process.env.OPENAI_API_KEY
        ? "Configured"
        : "Missing"
    }`
  );

  console.log("--------------------------------");

});
```
