import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, 'google-token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
];

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return null;
  }
  const redirectUri = GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
}

function loadStoredTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export function isConfigured() {
  return Boolean(getOAuthClient());
}

export function isConnected() {
  return isConfigured() && Boolean(loadStoredTokens()?.refresh_token);
}

export function getAuthUrl() {
  const client = getOAuthClient();
  if (!client) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in .env');
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function handleOAuthCallback(code) {
  const client = getOAuthClient();
  if (!client) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in .env');
  const { tokens } = await client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

function getAuthedClient() {
  const client = getOAuthClient();
  const tokens = loadStoredTokens();
  if (!client || !tokens) {
    throw new Error('Google is not connected. Visit /auth/google in your browser first.');
  }
  client.setCredentials(tokens);
  client.on('tokens', (newTokens) => {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...tokens, ...newTokens }, null, 2));
  });
  return client;
}

// --- Tool definitions, in Ollama/OpenAI function-calling format ---

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_calendar_events',
      description: "List events on the user's primary Google Calendar within a time range.",
      parameters: {
        type: 'object',
        properties: {
          timeMin: { type: 'string', description: 'ISO 8601 start of range. Defaults to now.' },
          timeMax: { type: 'string', description: 'ISO 8601 end of range. Optional.' },
          maxResults: { type: 'integer', description: 'Max events to return. Default 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description: "Create an event on the user's primary Google Calendar.",
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Event title.' },
          start: { type: 'string', description: 'ISO 8601 start datetime, e.g. 2026-10-03T15:00:00-07:00.' },
          end: { type: 'string', description: 'ISO 8601 end datetime.' },
          description: { type: 'string' },
          location: { type: 'string' },
        },
        required: ['summary', 'start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_gmail',
      description: "Search the user's Gmail using Gmail search syntax (e.g. 'from:bob subject:invoice').",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query.' },
          maxResults: { type: 'integer', description: 'Max messages to return. Default 5.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: "Send an email from the user's Gmail account.",
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address.' },
          subject: { type: 'string' },
          body: { type: 'string', description: 'Plain text email body.' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_drive_files',
      description: "Search the user's Google Drive by file name.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to search for in file names.' },
          maxResults: { type: 'integer', description: 'Max files to return. Default 10.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_drive_file',
      description: 'Read the text content of a Google Doc or plain-text file from Drive, given its file ID.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'The Drive file ID (from search_drive_files).' },
        },
        required: ['fileId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_sheet_values',
      description: 'Read cell values from a Google Sheet.',
      parameters: {
        type: 'object',
        properties: {
          spreadsheetId: { type: 'string' },
          range: { type: 'string', description: "A1 notation range, e.g. 'Sheet1!A1:D10'." },
        },
        required: ['spreadsheetId', 'range'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_sheet_values',
      description: 'Write cell values into a Google Sheet.',
      parameters: {
        type: 'object',
        properties: {
          spreadsheetId: { type: 'string' },
          range: { type: 'string', description: "A1 notation range, e.g. 'Sheet1!A1:B2'." },
          values: {
            type: 'array',
            description: 'Rows of values, e.g. [["a","b"],["c","d"]].',
            items: { type: 'array', items: {} },
          },
        },
        required: ['spreadsheetId', 'range', 'values'],
      },
    },
  },
];

function encodeEmail({ to, subject, body }) {
  const message = [`To: ${to}`, `Subject: ${subject}`, '', body].join('\n');
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function executeTool(name, args) {
  const auth = getAuthedClient();

  switch (name) {
    case 'list_calendar_events': {
      const calendar = google.calendar({ version: 'v3', auth });
      const { data } = await calendar.events.list({
        calendarId: 'primary',
        timeMin: args.timeMin || new Date().toISOString(),
        timeMax: args.timeMax,
        maxResults: args.maxResults || 10,
        singleEvents: true,
        orderBy: 'startTime',
      });
      return (data.items || []).map((e) => ({
        id: e.id,
        summary: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        location: e.location,
      }));
    }

    case 'create_calendar_event': {
      const calendar = google.calendar({ version: 'v3', auth });
      const { data } = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: args.summary,
          description: args.description,
          location: args.location,
          start: { dateTime: args.start },
          end: { dateTime: args.end },
        },
      });
      return { id: data.id, htmlLink: data.htmlLink, status: 'created' };
    }

    case 'search_gmail': {
      const gmail = google.gmail({ version: 'v1', auth });
      const { data } = await gmail.users.messages.list({
        userId: 'me',
        q: args.query,
        maxResults: args.maxResults || 5,
      });
      const messages = data.messages || [];
      const results = [];
      for (const m of messages) {
        const { data: msg } = await gmail.users.messages.get({
          userId: 'me',
          id: m.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        const headers = Object.fromEntries(
          (msg.payload?.headers || []).map((h) => [h.name, h.value])
        );
        results.push({
          id: m.id,
          from: headers.From,
          subject: headers.Subject,
          date: headers.Date,
          snippet: msg.snippet,
        });
      }
      return results;
    }

    case 'send_email': {
      const gmail = google.gmail({ version: 'v1', auth });
      const { data } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodeEmail(args) },
      });
      return { id: data.id, status: 'sent' };
    }

    case 'search_drive_files': {
      const drive = google.drive({ version: 'v3', auth });
      const safeQuery = String(args.query).replace(/'/g, "\\'");
      const { data } = await drive.files.list({
        q: `name contains '${safeQuery}' and trashed = false`,
        pageSize: args.maxResults || 10,
        fields: 'files(id, name, mimeType, webViewLink, modifiedTime)',
      });
      return data.files || [];
    }

    case 'read_drive_file': {
      const drive = google.drive({ version: 'v3', auth });
      const { data: meta } = await drive.files.get({
        fileId: args.fileId,
        fields: 'name, mimeType',
      });

      if (meta.mimeType === 'application/vnd.google-apps.document') {
        const { data } = await drive.files.export(
          { fileId: args.fileId, mimeType: 'text/plain' },
          { responseType: 'text' }
        );
        return { name: meta.name, content: data };
      }
      if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
        return {
          error: 'This is a Google Sheet. Use read_sheet_values with this file ID as spreadsheetId instead.',
        };
      }
      if (meta.mimeType?.startsWith('text/') || meta.mimeType === 'application/json') {
        const { data } = await drive.files.get(
          { fileId: args.fileId, alt: 'media' },
          { responseType: 'text' }
        );
        return { name: meta.name, content: data };
      }
      return { error: `Unsupported file type for reading: ${meta.mimeType}` };
    }

    case 'read_sheet_values': {
      const sheets = google.sheets({ version: 'v4', auth });
      const { data } = await sheets.spreadsheets.values.get({
        spreadsheetId: args.spreadsheetId,
        range: args.range,
      });
      return { values: data.values || [] };
    }

    case 'write_sheet_values': {
      const sheets = google.sheets({ version: 'v4', auth });
      const { data } = await sheets.spreadsheets.values.update({
        spreadsheetId: args.spreadsheetId,
        range: args.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: args.values },
      });
      return { updatedRange: data.updatedRange, updatedCells: data.updatedCells };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
