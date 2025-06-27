const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();

// ================= CONFIG ================= //
const token = process.env.TOKEN;
const PORT = process.env.PORT || 3000;
const CATEGORIES = ['Studies', 'Workout', 'Hobby', 'Skill', 'Work', 'Bonus'];
const DAILY_XP_LIMIT = 20;
const LEVEL_UP_XP = 500;

// ================= INIT ================= //
// Critical fix for 409 errors
process.env.NTBA_FIX_319 = "1";
process.env.NTBA_FIX_350 = "1";

const bot = new TelegramBot(token, {
  polling: {
    autoStart: false, // Prevents conflicts
    interval: 300,    // Optimized polling
    timeout: 10       // Faster error recovery
  }
});

// ================= DATABASE ================= //
let users = {};
let currentMonth = new Date().getMonth();

// ================= HELPERS ================= //
const getUsername = (from) => 
  from.username || [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Anonymous';

const checkMonthlyReset = () => {
  const now = new Date();
  if (now.getMonth() !== currentMonth) {
    currentMonth = now.getMonth();
    Object.keys(users).forEach(id => {
      users[id].monthlyXP = 0;
      users[id].dailyXP = {};
    });
  }
};

// ================= SERVER ================= //
app.get('/', (req, res) => res.send('🔮 Bot is alive'));
app.listen(PORT, () => {
  console.log(`🟢 Server running on port ${PORT}`);
  bot.startPolling(); // Start AFTER server
  console.log('🤖 Bot polling started');
});

// ================= COMMANDS ================= //

// Start Command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (!users[chatId]) {
    users[chatId] = {
      totalXP: 0,
      monthlyXP: 0,
      dailyXP: {},
      username: getUsername(msg.from)
    };
  }
  
  bot.sendMessage(
    chatId,
    `🧙 *Diary of a Dead Wizard* 🔮\n\n` +
    `📝 *Categories*: ${CATEGORIES.join(', ')}\n` +
    `⚡ *Daily Limit*: ${DAILY_XP_LIMIT} XP/category\n` +
    `🏆 *Level Up*: Every ${LEVEL_UP_XP} XP\n\n` +
    `✨ *Commands*:\n` +
    `/log [category] [XP]\n` +
    `/xp - Your progress\n` +
    `/monthly - Current rankings\n` +
    `/alltime - All-time leaderboard`,
    { parse_mode: 'Markdown' }
  );
});

// Log XP Command
bot.onText(/\/log (.+?) (.+)/, (msg, match) => {
  try {
    checkMonthlyReset();
    const chatId = msg.chat.id;
    const inputCategory = match[1].trim();
    const xp = parseInt(match[2]);

    // Validate category
    const category = CATEGORIES.find(c => 
      c.toLowerCase() === inputCategory.toLowerCase()
    );
    
    if (!category) {
      throw new Error(`Invalid category! Use:\n${CATEGORIES.join('\n')}`);
    }

    if (isNaN(xp) || xp <= 0) {
      throw new Error("XP must be a positive number!");
    }

    // Initialize user
    if (!users[chatId]) {
      users[chatId] = { 
        totalXP: 0, 
        monthlyXP: 0, 
        dailyXP: {},
        username: getUsername(msg.from)
      };
    }

    // Daily limit check
    const today = new Date().toDateString();
    users[chatId].dailyXP[today] = users[chatId].dailyXP[today] || {};
    const dailyXP = users[chatId].dailyXP[today][category] || 0;
    
    if (dailyXP + xp > DAILY_XP_LIMIT) {
      throw new Error(`Daily limit for ${category} is ${DAILY_XP_LIMIT} XP (already logged ${dailyXP} XP)`);
    }

    // Update XP
    users[chatId].totalXP += xp;
    users[chatId].monthlyXP += xp;
    users[chatId].dailyXP[today][category] = dailyXP + xp;
    
    // Response
    const level = Math.floor(users[chatId].totalXP / LEVEL_UP_XP);
    bot.sendMessage(
      chatId,
      `✨ *+${xp} XP in ${category}!*\n\n` +
      `📅 Monthly: ${users[chatId].monthlyXP} XP\n` +
      `🏆 Total: ${users[chatId].totalXP} XP (Level ${level})`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
  }
});

// XP Command
bot.onText(/\/xp/, (msg) => {
  const chatId = msg.chat.id;
  const user = users[chatId] || { totalXP: 0, monthlyXP: 0 };
  const level = Math.floor(user.totalXP / LEVEL_UP_XP);
  
  bot.sendMessage(
    chatId,
    `📊 *Your Progress*\n\n` +
    `📅 Monthly: ${user.monthlyXP} XP\n` +
    `🏆 Total: ${user.totalXP} XP\n` +
    `🔮 Level: ${level}`,
    { parse_mode: 'Markdown' }
  );
});

// Monthly Leaderboard
bot.onText(/\/monthly/, (msg) => {
  checkMonthlyReset();
  const sorted = Object.values(users)
    .filter(user => user.monthlyXP > 0)
    .sort((a, b) => b.monthlyXP - a.monthlyXP)
    .slice(0, 10);
  
  if (sorted.length === 0) {
    return bot.sendMessage(msg.chat.id, "📭 No monthly XP logged yet!");
  }

  let leaderboard = "📅 *Monthly Leaderboard*\n\n";
  sorted.forEach((user, index) => {
    leaderboard += `${index + 1}. ${user.username}: ${user.monthlyXP} XP\n`;
  });
  
  bot.sendMessage(msg.chat.id, leaderboard, { parse_mode: 'Markdown' });
});

// All-Time Leaderboard
bot.onText(/\/alltime/, (msg) => {
  const sorted = Object.values(users)
    .filter(user => user.totalXP > 0)
    .sort((a, b) => b.totalXP - a.totalXP)
    .slice(0, 10);
  
  if (sorted.length === 0) {
    return bot.sendMessage(msg.chat.id, "📭 No XP logged yet!");
  }

  let leaderboard = "🌠 *All-Time Leaderboard*\n\n";
  sorted.forEach((user, index) => {
    const level = Math.floor(user.totalXP / LEVEL_UP_XP);
    leaderboard += `${index + 1}. ${user.username}: ${user.totalXP} XP (Level ${level})\n`;
  });
  
  bot.sendMessage(msg.chat.id, leaderboard, { parse_mode: 'Markdown' });
});

// ================= STARTUP ================= //
console.log('✅ Bot initialized. Testing connection...');

// Test ping
bot.getMe().then(() => {
  console.log('🔗 Bot connected successfully!');
}).catch(err => {
  console.error('❌ Connection failed:', err);
});
