/**
 * /ask — answer from built-in bot facts, or from retrieved server history.
 *
 * This command deliberately does NOT pretend to be generative AI. It:
 *  1. Matches the question against predefined bot facts (keyword matching).
 *  2. Otherwise retrieves and keyword-matches accessible Discord history.
 *  3. Otherwise states clearly that no answer is available.
 */

import {
  searchGuildMessages,
  formatResultLine,
  excerpt,
} from '../search.js';

export const data = {
  name: 'ask',
  description: 'Answer from built-in bot facts or retrieved server history (no AI model)',
  dm_permission: false,
  options: [
    {
      type: 3, // STRING
      name: 'question',
      description: 'Your question — keywords help me find matching messages',
      required: true,
      min_length: 1,
      max_length: 500,
    },
  ],
};

/** Exact mandated answer for creator questions. */
export const CREATOR_RESPONSE =
  "Dev's Personal AI was created and developed by Dev Chowdhary.";

/**
 * Built-in knowledge base. Each fact lists phrase/keyword triggers and the
 * exact canned answer. Matching is plain JavaScript substring scoring.
 */
export const BOT_FACTS = [
  {
    id: 'creator',
    answer: CREATOR_RESPONSE,
    phrases: [
      'who created', 'who made', 'who developed', 'who built', 'who wrote',
      'creator', 'created by', 'made by', 'developed by', 'dev chowdhary',
      'chowdhary', 'who is the developer', 'who is the author',
    ],
    anyWords: ['created', 'creator', 'developer', 'author', 'maker', 'chowdhary'],
    requiredContext: ['bot', 'you', 'your', 'it', 'assistant', 'ai', "dev's personal ai", 'devs personal ai'],
  },
  {
    id: 'name',
    answer: "My name is Dev's Personal AI — a Discord bot that runs as a Cloudflare Worker.",
    phrases: ['your name', 'what are you called', 'what is this bot', 'what is dev', 'bot name', 'introduce yourself'],
    anyWords: ['name', 'called', 'introduce'],
    requiredContext: [],
  },
  {
    id: 'runtime',
    answer:
      'My runtime is Cloudflare Workers, and Discord reaches me through HTTP Interactions — there is no permanent Gateway connection.',
    phrases: ['cloudflare workers', 'what runtime', 'which runtime', 'where are you hosted', 'where do you run', 'hosting', 'deployed on'],
    anyWords: ['runtime', 'cloudflare', 'workers', 'hosted', 'hosting', 'deployed'],
    requiredContext: [],
  },
  {
    id: 'platform',
    answer: 'My platform is Discord. I am a Discord bot driven by slash commands via HTTP Interactions.',
    phrases: ['what platform', 'which platform', 'built on'],
    anyWords: ['platform', 'discord'],
    requiredContext: [],
  },
  {
    id: 'purpose',
    answer:
      'My purpose is to search server information, history, and announcements. I answer with /ask, /server, and /announcements.',
    phrases: ['what do you do', 'what can you do', 'what is this bot', 'what is dev', 'your purpose', 'what are your commands', 'what commands'],
    anyWords: ['purpose', 'commands', 'features', 'help', 'does'],
    requiredContext: ['you', 'your', 'bot', 'do'],
  },
  {
    id: 'implementation',
    answer:
      'I do not use any AI model. I am JavaScript-based retrieval: keyword matching over built-in facts and Discord messages fetched through the REST API.',
    phrases: [
      'how do you work', 'how do you search', 'do you use ai', 'is this ai', 'are you an ai',
      'which ai', 'what ai', 'ai model', 'gpt model', 'chatgpt api', 'openai api', 'gemini api',
      'language model', 'generative', 'machine learning', 'neural', 'llm',
    ],
    anyWords: ['ai', 'gpt', 'gemini', 'openai', 'llm', 'generative', 'model', 'algorithm'],
    requiredContext: [],
  },
  {
    id: 'not-ai',
    answer:
      "No. Dev's Personal AI is not generative AI. It is a basic server-information assistant powered by JavaScript search and retrieval.",
    phrases: ['are you chatgpt', 'are you gemini', 'are you openai', 'are you real ai', 'are you sentient', 'are you conscious'],
    anyWords: ['sentient', 'conscious', 'chatgpt'],
    requiredContext: [],
  },
];

/**
 * Detect the creator intent and return the exact mandated sentence.
 * @param {string} question
 * @returns {boolean}
 */
export function isCreatorQuestion(question) {
  const q = String(question).toLowerCase();
  if (/\bchowdhary\b/.test(q)) return true;
  const asksIdentity =
    /\b(who|whom)\b[^?]{0,40}\b(created|create|made|make|developed|built|wrote|writes)\b/.test(q) ||
    /\b(creator|created by|made by|developed by)\b/.test(q);
  const aboutTheBot =
    /\b(bot|you|your|it|assistant|veera|dev'?s personal ai|devs personal ai)\b/.test(q) ||
    /\bwho\b[^?]{0,20}\b(is|was)\b[^?]{0,20}\b(creator|developer|author|maker)\b/.test(q);
  return asksIdentity && aboutTheBot;
}

/**
 * Match a question against the built-in facts.
 * @param {string} question
 * @returns {{id: string, answer: string, score: number}|null}
 */
export function matchBotFact(question) {
  const q = String(question).toLowerCase();
  if (isCreatorQuestion(question)) {
    return { id: 'creator', answer: CREATOR_RESPONSE, score: 100 };
  }

  let best = null;
  for (const fact of BOT_FACTS) {
    if (fact.id === 'creator') continue; // handled above
    let score = 0;
    for (const phrase of fact.phrases) {
      if (q.includes(phrase)) score += 3;
    }
    for (const word of fact.anyWords) {
      if (q.includes(word)) score += 1;
    }
    if (score > 0 && fact.requiredContext.length > 0) {
      const hasContext = fact.requiredContext.some((word) => q.includes(word));
      if (!hasContext) score = 0;
    }
    if (score >= 3 && (!best || score > best.score)) {
      best = { id: fact.id, answer: fact.answer, score };
    }
  }
  return best;
}

/**
 * Validate the question option.
 * @param {any} interaction
 * @returns {{ok: boolean, question?: string, error?: string}}
 */
function readQuestion(interaction) {
  const option = (interaction.data?.options || []).find((o) => o.name === 'question');
  const question = typeof option?.value === 'string' ? option.value.trim() : '';
  if (!question) {
    return { ok: false, error: 'Please ask a non-empty question, e.g. `/ask question:what is this bot`.' };
  }
  if (question.length > 500) {
    return { ok: false, error: 'Questions are limited to 500 characters.' };
  }
  return { ok: true, question };
}

/**
 * Execute the /ask command.
 *
 * @param {object} ctx
 * @param {any} ctx.interaction
 * @param {any} ctx.client Discord REST client.
 * @param {any} ctx.db D1 binding or null.
 * @returns {Promise<{content?: string, embeds?: object[], flags?: number}>}
 */
export async function execute({ interaction, client, db = null }) {
  const { ok, question, error } = readQuestion(interaction);
  if (!ok) return { content: error, flags: 64 };

  // 1. Built-in knowledge.
  const fact = matchBotFact(question);
  if (fact) {
    if (fact.id === 'creator') {
      return { content: CREATOR_RESPONSE };
    }
    return {
      content: `**${fact.answer}**\n_Source: built-in knowledge (JavaScript keyword matching)._`,
    };
  }

  // 2. Retrieved server history.
  const outcome = await searchGuildMessages({
    client,
    db,
    guildId: interaction.guild_id,
    query: question,
    scope: 'server',
  });

  if (outcome.results.length > 0) {
    const lines = outcome.results.map((entry, index) => formatResultLine(entry.record, index + 1));
    return {
      embeds: [
        {
          title: `From server history: ${excerpt(question, 80)}`,
          description:
            `No built-in fact matched. These retrieved messages look relevant ` +
            `(keyword matching — not generated):\n\n${lines.join('\n\n')}`,
          color: 0x57f287,
          footer: { text: `${outcome.stats.messagesScanned} messages retrieved · no AI model used` },
        },
      ],
    };
  }

  // 3. Honest "I don't know".
  return {
    content:
      `I could not find an answer to **${excerpt(question, 120)}** in my built-in facts ` +
      `or in the accessible server history I retrieved ` +
      `(${outcome.stats.messagesScanned} messages across ${outcome.stats.channelsSearched} channels). ` +
      `I don't generate answers — I only report what I can retrieve. ` +
      `Try again with distinctive keywords from the message you remember.`,
  };
}
