function getAssistantIntent(message) {
  const text = message.toLowerCase();

  if (/(create|publish|make).*(listing)/.test(text)) {
    const select = /(highest|most valuable|best)/.test(text) ? 'highest_value' : 'latest';
    return { tool: 'create_listing', args: { select } };
  }

  if (/\b(how much|total|summary|stats)\b/.test(text)
      || /\b(my|our|inventory|estimated|listed)\s+(total\s+)?value\b/.test(text)
      || /\b(carbon|co2)\s+(saved|savings|summary|stats|footprint)\b/.test(text)) {
    return { tool: 'get_summary', args: {} };
  }

  if (/\b(inventory|what do i have|show.*materials|list.*materials|unused)\b/.test(text)) {
    return { tool: 'list_inventory', args: { status: text.includes('unused') ? 'Available' : null } };
  }

  return null;
}

module.exports = { getAssistantIntent };
