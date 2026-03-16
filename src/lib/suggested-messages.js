export const REENGAGEMENT_MESSAGES = [
  "Hi {{firstName}}! I've been thinking about you and wanted to check in. We're kicking off a fresh 10-Day Metabolic Reset and I would LOVE to have you join us! No pressure at all — just wanted you to know the door is always open. Would you be up for chatting about it?",
  "Hey {{firstName}}! I hope you're doing well! I know life gets busy, but I wanted to reach out because we have some exciting new flavors and plans that I think you'd really love. Want me to fill you in?",
  "{{firstName}}! It's been a little while and I just wanted to say hi and see how you're doing. A lot of our community members are jumping back in this month and the energy is amazing. Would love to have you be part of it if you're interested!",
  "Hi {{firstName}}, just thinking of you today! I know your health journey didn't stop just because we lost touch. If you're ever ready to pick back up or even just want to chat about where you're at, I'm here for you. No strings attached 💛",
];

export const CHECKIN_MESSAGES = [
  "Hey {{firstName}}! Just checking in on your week — how are you feeling? Any wins to celebrate or challenges I can help with? I'm here for you!",
  "Hi {{firstName}}! Happy [day]! How's everything going with your plan this week? Remember, progress over perfection. Let me know if you need anything!",
  "{{firstName}}! Quick check-in — how are your meals going this week? Any recipes you're loving or getting tired of? I have some great new options if you need a refresh!",
];

export const CELEBRATION_MESSAGES = [
  "{{firstName}}!! I am SO proud of you! 🎉 Look at the progress you've made — this is incredible and you should feel amazing about what you've accomplished. Keep going, you're on fire!",
  "Hey {{firstName}}, I just wanted to take a moment to celebrate YOU! Hitting this milestone is a big deal and it shows how committed you are. I'm honored to be part of your journey!",
  "{{firstName}}! Can we talk about how amazing you're doing?! 🌟 Your dedication is inspiring and I love watching you crush your goals. Here's to even more wins ahead!",
];

export const SEASONAL_MESSAGES = [
  "Hi {{firstName}}! Spring is here and it's the perfect time for a fresh start! 🌸 We're putting together a Spring Reset challenge and I'd love for you to join. Want the details?",
  "Hey {{firstName}}! Summer is right around the corner and so many people in our community are feeling confident and energized. Want to make this YOUR summer? Let's chat about getting started!",
  "{{firstName}}! The holidays can be tricky but I've got some amazing tips and recipes to help you stay on track AND enjoy the season. Want me to send them your way?",
  "Happy New Year {{firstName}}! 🎆 If a healthier you is on your resolution list this year, I'd love to help you make it happen. We're starting a New Year kickoff group — interested?",
];

export const ALL_MESSAGES = {
  reengagement: REENGAGEMENT_MESSAGES,
  checkin: CHECKIN_MESSAGES,
  celebrations: CELEBRATION_MESSAGES,
  seasonal: SEASONAL_MESSAGES,
};

/**
 * Replace {{firstName}} in a message with the actual first name.
 */
export function personalizeMessage(message, firstName) {
  return message.replace(/\{\{firstName\}\}/g, firstName || "there");
}

/**
 * Get all messages from an array with {{firstName}} replaced.
 */
export function getAllMessages(messages, firstName) {
  return messages.map((m) => personalizeMessage(m, firstName));
}

/**
 * Pick a message by index (wraps around) with {{firstName}} replaced.
 */
export function getMessageByIndex(messages, index, firstName) {
  const msg = messages[index % messages.length];
  return personalizeMessage(msg, firstName);
}
