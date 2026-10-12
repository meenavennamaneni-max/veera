/**
 * /server — search accessible Discord server messages for a question.
 *
 * Returns relevant retrieved messages with channel names, timestamps and
 * original message links. Retrieval is explicit REST pagination; matching is
 * JavaScript keyword scoring. Nothing is generated or invented.
 */

import {
  searchGuildMessages,
  formatSearchResults,
  excerpt,
  tokenize,
} from '../search.js';

export const data = {
  name: 'server',
  description: 'Search accessible server messages for a question or keywords (retrieved, not generated)',
  dm_permission: false,
  options: [
    {
      type: 3, // STRING
      name: 'question',
      description: 'What to look for in server history — keywords work best',
      required: true,
      min_length: 1,
      max_length: 500,
    },
  ],
};

/**
 * Execute the /server command.
 *
 * @param {object} ctx
 * @param {any} ctx.interaction
 * @param {any} ctx.client Discord REST client.
 * @param {any} ctx.db D1 binding or null.
 * @returns {Promise<{content?: string, embeds?: object[], flags?: number}>}
 */
export async function execute({ interaction, client, db = null }) {
  const option = (interaction.data?.options || []).find((o) => o.name === 'question');
  const question = typeof option?.value === 'string' ? option.value.trim() : '';

  if (!question) {
    return {
      content: 'Please provide a question or keywords, e.g. `/server question:release date`.',
      flags: 64,
    };
  }
  if (question.length > 500) {
    return { content: 'Questions are limited to 500 characters.', flags: 64 };
  }
  if (tokenize(question).length === 0) {
    return {
      content:
        'Please include at least one searchable keyword (letters or digits) — ' +
        'punctuation and common words are ignored.',
      flags: 64,
    };
  }

  const outcome = await searchGuildMessages({
    client,
    db,
    guildId: interaction.guild_id,
    query: question,
    scope: 'server',
  });

  if (outcome.results.length === 0) {
    return {
      content:
        `No accessible server messages matched **${excerpt(question, 80)}** ` +
        `(searched ${outcome.stats.messagesScanned} recent messages across ` +
        `${outcome.stats.channelsSearched} channels). ` +
        `I only return messages I can actually retrieve — try different keywords.`,
      flags: 64,
    };
  }

  return formatSearchResults({
    title: `Server search: ${excerpt(question, 80)}`,
    outcome,
  });
}
