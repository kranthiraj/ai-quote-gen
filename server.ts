/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;
const DB_PATH = path.join(process.cwd(), "data", "db.json");

app.use(express.json({ limit: "10mb" }));

// Helper to read database state
function readDB(): any {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { companies: [], customers: [], items: [], quotations: [], quotationVersions: [], visualTemplates: [], settings: {}, adminControls: {} };
    }
    const data = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading JSON database:", err);
    return { companies: [], customers: [], items: [], quotations: [], quotationVersions: [], visualTemplates: [], settings: {}, adminControls: {} };
  }
}

// Helper to write database state
function writeDB(data: any): void {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing JSON database:", err);
  }
}

// Lazy integration of Gemini client
let _aiClient: any = null;
function getGeminiClient(): GoogleGenAI {
  if (!_aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY") {
      throw new Error("GEMINI_API_KEY is missing or unconfigured. Please add your Gemini API key in Settings > Secrets to enable full AI generation.");
    }
    _aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return _aiClient;
}

// ==========================================
// REST API FOR FULL DATABASE STATE
// ==========================================
app.get("/api/db", (req, res) => {
  const db = readDB();
  res.json({
    companies: db.companies || [],
    customers: db.customers || [],
    items: db.items || [],
    quotations: db.quotations || [],
    templates: db.visualTemplates || [],
    settings: db.settings || {},
    adminControls: db.adminControls || {},
    userRole: db.userRole || "SUPER_ADMIN"
  });
});

app.get("/api/db/backup", (req, res) => {
  const db = readDB();
  res.json(db);
});

// ==========================================
// REST API FOR COMPANIES
// ==========================================
app.get("/api/companies", (req, res) => {
  const db = readDB();
  res.json(db.companies || []);
});

app.post("/api/companies", (req, res) => {
  const db = readDB();
  const newCompany = {
    ...req.body,
    id: "comp-" + Date.now(),
    isActive: true,
  };
  db.companies = [...(db.companies || []), newCompany];
  writeDB(db);
  res.status(201).json(newCompany);
});

app.put("/api/companies/:id", (req, res) => {
  const db = readDB();
  const { id } = req.params;
  db.companies = (db.companies || []).map((c: any) =>
    c.id === id ? { ...c, ...req.body } : c
  );
  writeDB(db);
  const updated = db.companies.find((c: any) => c.id === id);
  res.json(updated);
});

app.post("/api/companies/:id/clone", (req, res) => {
  const db = readDB();
  const { id } = req.params;
  const original = (db.companies || []).find((c: any) => c.id === id);
  if (!original) {
    return res.status(404).json({ error: "Company not found" });
  }
  const clone = {
    ...original,
    id: "comp-" + Date.now(),
    name: `${original.name} (Copy)`,
  };
  db.companies = [...(db.companies || []), clone];
  writeDB(db);
  res.status(201).json(clone);
});

app.delete("/api/companies/:id", (req, res) => {
  const db = readDB();
  const { id } = req.params;
  db.companies = (db.companies || []).filter((c: any) => c.id !== id);
  writeDB(db);
  res.json({ success: true });
});

// ==========================================
// REST API FOR CUSTOMERS
// ==========================================
app.get("/api/customers", (req, res) => {
  const db = readDB();
  res.json(db.customers || []);
});

app.post("/api/customers", (req, res) => {
  const db = readDB();
  const newCustomer = {
    ...req.body,
    id: "cust-" + Date.now(),
  };
  db.customers = [...(db.customers || []), newCustomer];
  writeDB(db);
  res.status(201).json(newCustomer);
});

app.put("/api/customers/:id", (req, res) => {
  const db = readDB();
  const { id } = req.params;
  db.customers = (db.customers || []).map((c: any) =>
    c.id === id ? { ...c, ...req.body } : c
  );
  writeDB(db);
  const updated = db.customers.find((c: any) => c.id === id);
  res.json(updated);
});

app.delete("/api/customers/:id", (req, res) => {
  const db = readDB();
  const { id } = req.params;
  db.customers = (db.customers || []).filter((c: any) => c.id !== id);
  writeDB(db);
  res.json({ success: true });
});

app.post("/api/customers/import", (req, res) => {
  const db = readDB();
  const list = req.body;
  if (Array.isArray(list)) {
    const parsedList = list.map((item) => ({
      ...item,
      id: item.id || "cust-" + Math.random().toString(36).substr(2, 9),
    }));
    db.customers = [...(db.customers || []), ...parsedList];
    writeDB(db);
    res.json({ success: true, count: parsedList.length });
  } else {
    res.status(400).json({ error: "Invalid data format. Expected array." });
  }
});

// ==========================================
// REST API FOR REUSABLE ITEMS
// ==========================================
app.get("/api/items", (req, res) => {
  const db = readDB();
  res.json(db.items || []);
});

app.post("/api/items", (req, res) => {
  const db = readDB();
  const newItem = {
    id: "item-" + Date.now(),
    ...req.body,
    rate: Number(req.body.rate || 0),
    taxPercentage: Number(req.body.taxPercentage || 0),
  };
  db.items = [...(db.items || []), newItem];
  writeDB(db);
  res.status(201).json(newItem);
});

app.put("/api/items/:id", (req, res) => {
  const db = readDB();
  const { id } = req.params;
  db.items = (db.items || []).map((item: any) =>
    item.id === id ? { ...item, ...req.body, rate: Number(req.body.rate || 0), taxPercentage: Number(req.body.taxPercentage || 0) } : item
  );
  writeDB(db);
  res.json({ success: true });
});

app.delete("/api/items/:id", (req, res) => {
  const db = readDB();
  const { id } = req.params;
  db.items = (db.items || []).filter((item: any) => item.id !== id);
  writeDB(db);
  res.json({ success: true });
});

// ==========================================
// REST API FOR QUOTATIONS & VERSIONS
// ==========================================
app.get("/api/quotations", (req, res) => {
  const db = readDB();
  res.json(db.quotations || []);
});

app.get("/api/quotations/versions/:quoteId", (req, res) => {
  const db = readDB();
  const { quoteId } = req.params;
  const versions = (db.quotationVersions || []).filter((v: any) => v.quotationId === quoteId);
  res.json(versions);
});

app.post("/api/quotations", (req, res) => {
  const db = readDB();
  const quoteData = req.body;
  const newId = "quote-" + Date.now();
  const newQuote = {
    ...quoteData,
    id: newId,
    version: 1,
  };

  db.quotations = [...(db.quotations || []), newQuote];

  // Save revision history version 1
  const newVer = {
    id: "ver-" + Date.now(),
    quotationId: newId,
    version: 1,
    timestamp: new Date().toISOString(),
    updatedBy: "System Builder",
    changes: "Initial Quotation Creation",
    data: newQuote,
  };
  db.quotationVersions = [...(db.quotationVersions || []), newVer];

  writeDB(db);
  res.status(201).json(newQuote);
});

app.put("/api/quotations/:id", (req, res) => {
  const db = readDB();
  const { id } = req.params;
  const oldQuote = (db.quotations || []).find((q: any) => q.id === id);

  if (!oldQuote) {
    return res.status(404).json({ error: "Quotation not found" });
  }

  const newVersionNumber = (oldQuote.version || 1) + 1;
  const updatedQuote = {
    ...req.body,
    id,
    version: newVersionNumber,
  };

  db.quotations = (db.quotations || []).map((q: any) => (q.id === id ? updatedQuote : q));

  // Save new Revision Log
  const newVer = {
    id: "ver-" + Date.now(),
    quotationId: id,
    version: newVersionNumber,
    timestamp: new Date().toISOString(),
    updatedBy: "Supervisor Admin",
    changes: req.body.revisionComment || `Modified quotation schema parameters to v${newVersionNumber}`,
    data: updatedQuote,
  };
  db.quotationVersions = [...(db.quotationVersions || []), newVer];

  writeDB(db);
  res.json(updatedQuote);
});

app.post("/api/quotations/:id/duplicate", (req, res) => {
  const db = readDB();
  const { id } = req.params;
  const original = (db.quotations || []).find((q: any) => q.id === id);
  if (!original) {
    return res.status(404).json({ error: "Quotation not found" });
  }
  const duplicate = {
    ...original,
    id: "quote-" + Date.now(),
    quotationNumber: `${original.quotationNumber}-DUP`,
    status: "Draft",
    version: 1,
  };
  db.quotations = [...(db.quotations || []), duplicate];

  // Save initial version log for duplicate
  const newVer = {
    id: "ver-" + Date.now(),
    quotationId: duplicate.id,
    version: 1,
    timestamp: new Date().toISOString(),
    updatedBy: "System duplicator",
    changes: `Cloned dynamically from ${original.quotationNumber}`,
    data: duplicate,
  };
  db.quotationVersions = [...(db.quotationVersions || []), newVer];

  writeDB(db);
  res.status(201).json(duplicate);
});

app.delete("/api/quotations/:id", (req, res) => {
  const db = readDB();
  const { id } = req.params;
  db.quotations = (db.quotations || []).filter((q: any) => q.id !== id);
  db.quotationVersions = (db.quotationVersions || []).filter((v: any) => v.quotationId !== id);
  writeDB(db);
  res.json({ success: true });
});

// ==========================================
// REST API FOR SYSTEM SETTINGS & ADMIN CONTROLS & USER ROLE
// ==========================================
app.get("/api/settings", (req, res) => {
  const db = readDB();
  res.json({
    settings: db.settings || {},
    adminControls: db.adminControls || {},
    userRole: db.userRole || "SUPER_ADMIN"
  });
});

app.put("/api/settings", (req, res) => {
  const db = readDB();
  db.settings = { ...(db.settings || {}), ...req.body.settings };
  if (req.body.adminControls) {
    db.adminControls = { ...(db.adminControls || {}), ...req.body.adminControls };
  }
  if (req.body.userRole) {
    db.userRole = req.body.userRole;
  }
  writeDB(db);
  res.json({ success: true, settings: db.settings, adminControls: db.adminControls, userRole: db.userRole });
});

// ==========================================
// REST API FOR VISUAL TEMPLATES
// ==========================================
app.get("/api/templates", (req, res) => {
  const db = readDB();
  res.json(db.visualTemplates || []);
});

app.post("/api/templates", (req, res) => {
  const db = readDB();
  const newTemplate = {
    id: "tmpl-" + Date.now(),
    isCustom: true,
    ...req.body,
  };
  db.visualTemplates = [...(db.visualTemplates || []), newTemplate];
  writeDB(db);
  res.status(201).json(newTemplate);
});

app.put("/api/templates/:id", (req, res) => {
  const db = readDB();
  const { id } = req.params;
  db.visualTemplates = (db.visualTemplates || []).map((t: any) =>
    t.id === id ? { ...t, ...req.body } : t
  );
  writeDB(db);
  res.json({ success: true });
});


// ==========================================
// AI-POWERED GEMINI ENDPOINTS
// ==========================================

// AI Quotation Generator API
app.post("/api/ai/generate-quotation", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const aiClient = getGeminiClient();
    const systemPrompt = `You are a professional quotation builder expert. Based on the user prompt: "${prompt}", generate a highly professional structural quote proposal.
You must return only a valid JSON response matching this schema:
{
  "quoteTitle": "Brief title of the project",
  "items": [
    {
      "name": "Item Name",
      "description": "Short explanation of the service/item",
      "quantity": 1,
      "unit": "LS or Pcs or Month",
      "price": 15000,
      "taxPercentage": 18
    }
  ],
  "terms": "Detailed T&C list formatted with numbers, custom parameters suitable for the industry",
  "notes": "Polite appreciation and payment notes"
}
Ensure reasonable real-world price values matching the industry standard requested. Match currency context logic (INR rates vs USD rates) appropriately. Do not wrap output in markdown codeblocks like \`\`\`json. Return pure raw JSON string.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsedData = JSON.parse(response.text.trim());
    res.json(parsedData);
  } catch (err: any) {
    console.error("AI Generation error:", err);
    res.status(500).json({ error: err.message || "Failed to make AI generation call due to missing SDK configuration." });
  }
});

// AI Product Generator API (e.g. Grocery quote generator)
app.post("/api/ai/generate-products", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const aiClient = getGeminiClient();
    const systemPrompt = `Based on requested products catalog prompt: "${prompt}", generate a detailed list of appropriate materials/products with realistic quantities and price rates.
You must return only a valid JSON response matching this schema:
{
  "items": [
    {
      "name": "Product Name",
      "description": "Product category/details",
      "quantity": 10,
      "unit": "Kgs or Bags or Pcs",
      "price": 120,
      "taxPercentage": 12
    }
  ],
  "terms": "Custom terms appropriate for logistics/delivery",
  "notes": "Custom notes regarding logistics/packaging"
}
Ensure typical GST brackets are assigned (e.g., grain items 5%, packed electronics 18%). Do not wrap response in markdown blocks.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsedData = JSON.parse(response.text.trim());
    res.json(parsedData);
  } catch (err: any) {
    console.error("AI Product Generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// AI Price Recommendation
app.post("/api/ai/price-recommendation", async (req, res) => {
  try {
    const { industry, serviceName } = req.body;
    const aiClient = getGeminiClient();
    const systemPrompt = `Analyze this service/product: "${serviceName}" in the "${industry}" industry.
Suggest realistic market price rates and suitable tax structures. Return a JSON structure exactly like:
{
  "recommendedRate": 1200,
  "rateUnit": "per hour or LS",
  "reasoning": "Brief explanation of standard pricing factors",
  "recommendedTaxPercentage": 18
}`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const parsedData = JSON.parse(response.text.trim());
    res.json(parsedData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// AI Customer Details Parser API
app.post("/api/ai/parse-customer", async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText) return res.status(400).json({ error: "Raw text is empty" });

    const aiClient = getGeminiClient();
    const systemPrompt = `Analyze the raw copied business card, raw message, or contact detail text string below and extract key customer variables.
Raw text: "${rawText}"

Please output a JSON response matching exactly this schema:
{
  "name": "Full Customer contact Person Name (e.g. Rajesh Kumar)",
  "companyName": "Extracted Corporate Company name (if available)",
  "gstin": "15 digit GSTIN identifier if present in the text, else empty",
  "pan": "10 digit PAN character-sequence if preset, else empty string",
  "address": "Full physical shipping, billing, or warehouse address if available",
  "mobile": "Contact number with extension if applicable",
  "email": "Official corporate or personal email address",
  "state": "State name (e.g. Maharashtra, California)",
  "country": "Country name (e.g. India, USA)"
}
If a field is missing, return empty string "". Output clean raw JSON only.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsedData = JSON.parse(response.text.trim());
    res.json(parsedData);
  } catch (err: any) {
    console.error("AI Parser error:", err);
    res.status(500).json({ error: err.message });
  }
});

// AI Translation API
app.post("/api/ai/translate", async (req, res) => {
  try {
    const { text, language } = req.body;
    if (!text || !language) return res.status(400).json({ error: "Text or language is missing" });

    const aiClient = getGeminiClient();
    const systemPrompt = `Translate the following text exactly into standard ${language} (e.g. Hindi, Tamil, Telugu, Kannada, English) maintaining professional corporate notation and pricing elements.
Keep mathematical rates and numerical elements intact, but translate explanation headers, notes, or terms.
Text to translate:
"${text}"

Return exactly the translated textual string without extraneous conversational prefix.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: systemPrompt,
    });

    res.json({ translatedText: response.text.trim() });
  } catch (err: any) {
    console.error("AI Translation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// AI Template Editor styling custom prompt (e.g. "make template green and premium")
app.post("/api/ai/template-editor", async (req, res) => {
  try {
    const { prompt, currentTemplate } = req.body;
    const aiClient = getGeminiClient();
    const systemPrompt = `You are a senior UI theme designer. The user wants to style their visual quotation template based on this color / design prompt: "${prompt}".
The current template is: ${JSON.stringify(currentTemplate)}.

Suggest custom theme updates focusing on:
1. "bgColor" (valid hex color or '#ffffff')
2. "accentColor" (valid hex color providing visual hierarchy)
3. "fontFamily" (e.g., 'Inter', 'JetBrains Mono', 'Playfair Display')

Return a JSON with the updated values matching this schema:
{
  "name": "Updated theme name",
  "bgColor": "hex code",
  "accentColor": "hex code",
  "fontFamily": "font string"
}`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    res.json(JSON.parse(response.text.trim()));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// STATIC ASSET SERVING & VITE DEVELOPMENT MIDDLEWARE
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Powered Quotation Builder backend server alive on http://localhost:${PORT}`);
  });
}

startServer();
