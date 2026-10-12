/**
 * /announcements — search accessible announcement channels for a topic.
 *
 * Scans Discord Announcement channels (plus channels named like
 * announcements/news/updates) and returns matching announcements with dates
 * and original message links.
 */

import {
  searchGuildMessages,
  formatSearchResults,
  excerpt,
  tokenize,
  isAnnouncementChannel,
  isSearchableTextChannel,
} from '../search.js';

export const data = {
  name: 'announcements',
  description: 'Search accessible announcement channels for a topic (retrieved, not generated)',
  dm_permission: false,
  options: [
    {
      type: 3, // STRING
      name: 'topic',
      description: 'Topic or keywords to find in announcements',
      required: true,
      min_length: 1,
      max_length: 500,
    },
  ],
};

/**
 * Execute the /announcements command.
 *
 * @param {object} ctx
 * @param {any} ctx.interaction
 * @param {any} ctx.client Discord REST client.
 * @param {any} ctx.db D1 binding or null.
 * @returns {Promise<{content?: string, embeds?: object[], flags?: number}>}
 */
export async function execute({ interaction, client, db = null }) {
  const option = (interaction.data?.options || []).find((o) => o.name === 'topic');
  const topic = typeof option?.value === 'string' ? option.value.trim() : '';

  if (!topic) {
    return {
      content: 'Please provide a topic, e.g. `/announcements topic:maintenance`.',
      flags: 64,
    };
  }
  if (topic.length > 500) {
    return { content: 'Topics are limited to 500 characters.', flags: 64 };
  }
  if (tokenize(topic).length === 0) {
    return {
      content:
        'Please include at least one searchable keyword (letters or digits) — ' +
        'punctuation and common words are ignored.',
      flags: 64,
    };
  }

  // Confirm the guild actually has announcement channels we can read.
  const channels = await client.getGuildChannels(interaction.guild_id);
  const announcementChannels = channels.filter(
    (channel) => isSearchableTextChannel(channel) && isAnnouncementChannel(channel),
  );
  if (announcementChannels.length === 0) {
    return {
      content:
        'This server has no announcement channels I can access. I look at Discord ' +
        'Announcement channels and channels named like #announcements, #news or #updates.',
      flags: 64,
    };
  }

  const outcome = await searchGuildMessages({
    client,
    db,
    guildId: interaction.guild_id,
    query: topic,
    scope: 'announcements',
    channels,
  });

  if (outcome.results.length === 0) {
    return {
      content:
        `No accessible announcements matched **${excerpt(topic, 80)}** ` +
        `(searched ${outcome.stats.messagesScanned} recent messages across ` +
        `${announcementChannels.length} announcement channels). ` +
        `I only return announcements I can actually retrieve — try different keywords.`,
      flags: 64,
    };
  }

  return formatSearchResults({
    title: `Announcements: ${excerpt(topic, 80)}`,
    outcome,
  });
}
