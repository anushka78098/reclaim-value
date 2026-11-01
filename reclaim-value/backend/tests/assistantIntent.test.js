const { getAssistantIntent } = require('../src/assistantIntent');

describe('Company assistant actions', () => {
  test.each([
    ['Create a listing for my highest-value unused material', { tool: 'create_listing', args: { select: 'highest_value' } }],
    ['Publish a listing', { tool: 'create_listing', args: { select: 'latest' } }],
    ['What is my total inventory value?', { tool: 'get_summary', args: {} }],
    ['Show my inventory', { tool: 'list_inventory', args: { status: null } }],
    ['List my unused materials', { tool: 'list_inventory', args: { status: 'Available' } }],
  ])('recognizes "%s"', (message, expected) => {
    expect(getAssistantIntent(message)).toEqual(expected);
  });

  test('leaves normal questions for Gemini or the app guide', () => {
    expect(getAssistantIntent('How does the marketplace work?')).toBeNull();
    expect(getAssistantIntent('Tell me a joke')).toBeNull();
  });
});
