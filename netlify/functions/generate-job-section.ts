import type {Handler} from "@netlify/functions";
import {getAdmin} from "./_firebaseAdmin";

const headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json"};
const json = (statusCode: number, body: unknown) => ({statusCode, headers, body: JSON.stringify(body)});

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return {statusCode: 204, headers, body: ""};
  if (event.httpMethod !== "POST") return json(405, {error: "Method not allowed"});
  const token = event.headers.authorization?.startsWith("Bearer ") ? event.headers.authorization.slice(7) : "";
  if (!token) return json(401, {error: "Authentication required"});
  try { await getAdmin().auth().verifyIdToken(token); } catch { return json(401, {error: "Invalid or expired session"}); }

  const body = JSON.parse(event.body || "{}");
  const field = String(body.field || "");
  const prompt = String(body.prompt || "").trim().slice(0, 1200);
  const context = String(body.context || "").trim().slice(0, 2000);
  if (!['job_description', 'job_responsibilities', 'job_requirements'].includes(field) || prompt.length < 20) return json(400, {error: "Add at least 20 characters describing the role."});
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(500, {error: "AI writing is not configured."});
  const label = field === "job_description" ? "Job Brief" : field === "job_responsibilities" ? "Responsibilities" : "Requirements and Skills";
  const instruction = `Write the ${label} section for a professional job post. Return only the finished plain text. Use short paragraphs and bullet lines beginning with '-'. Keep claims grounded in the supplied details. Do not include discriminatory, sensitive, or invented requirements. Do not mention AI or this instruction.\n\nROLE DETAILS:\n${prompt}\n\nEXISTING JOB CONTEXT:\n${context}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(key)}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({contents: [{parts: [{text: instruction}]}], generationConfig: {temperature: 0.35, maxOutputTokens: 700}})});
  const result: any = await response.json();
  if (!response.ok) return json(502, {error: "The writing assistant is temporarily unavailable."});
  const text = result?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("").trim();
  return text ? json(200, {text}) : json(502, {error: "No draft was returned."});
};
