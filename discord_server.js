// index.js
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import 'dotenv/config';
import fs from 'fs';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ==== KONFIGURASI ====
const GUILD_ID = '1403203750583341066';
const WELCOME_CHANNEL_ID = '1403203751812141180';
const LEVEL_CHANNEL_ID = '1403246560015417394'; // Channel untuk level up notifications
const ROLE_ID = '1403212464539303976'; // Role Verified
const VERIFY_EMOJI = '✅';

// Level Roles Configuration
const LEVEL_ROLES = {
  1: { id: '1403212464539303976', name: 'Verified', xp: 0 },
  5: { id: null, name: 'Active Member', xp: 250 },
  10: { id: null, name: 'Trusted Member', xp: 1000 },
  15: { id: null, name: 'Veteran', xp: 2500 },
  20: { id: null, name: 'Elite Member', xp: 5000 },
  25: { id: null, name: 'Legend', xp: 10000 }
};

// XP Configuration
const XP_CONFIG = {
  MESSAGE: { min: 15, max: 25, cooldown: 60000 }, // 15-25 XP per message, 1 min cooldown
  REACTION_GIVE: 5, // XP for giving reactions
  REACTION_RECEIVE: 3, // XP for receiving reactions
  VOICE_PER_MINUTE: 10, // XP per minute in voice channel
  DAILY_BONUS: 100, // Daily login bonus
  INVITE_BONUS: 500 // Bonus for successful invite
};

let verifyMessageId = null;
let userData = {}; // In-memory user data storage
let voiceTracking = {}; // Track voice channel time
let messageCooldowns = new Map(); // Message XP cooldowns

// Load user data
function loadUserData() {
  try {
    if (fs.existsSync('userdata.json')) {
      const data = fs.readFileSync('userdata.json', 'utf8');
      userData = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading user data:', error);
    userData = {};
  }
}

// Save user data
function saveUserData() {
  try {
    fs.writeFileSync('userdata.json', JSON.stringify(userData, null, 2));
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}

// Get or create user data
function getUserData(userId) {
  if (!userData[userId]) {
    userData[userId] = {
      xp: 0,
      level: 0,
      totalMessages: 0,
      voiceTime: 0,
      lastDaily: 0,
      joinedAt: Date.now()
    };
  }
  return userData[userId];
}

// Calculate level from XP
function calculateLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(xp));
}

// Calculate XP needed for next level
function getXPForLevel(level) {
  return Math.pow(level / 0.1, 2);
}

// Add XP to user
async function addXP(userId, amount, reason = '') {
  const user = getUserData(userId);
  const oldLevel = user.level;
  
  user.xp += amount;
  user.level = calculateLevel(user.xp);
  
  // Check for level up
  if (user.level > oldLevel) {
    await handleLevelUp(userId, user.level, oldLevel);
  }
  
  saveUserData();
  return user;
}

// Handle level up
async function handleLevelUp(userId, newLevel, oldLevel) {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return;

  const member = guild.members.cache.get(userId);
  if (!member) return;

  const channel = guild.channels.cache.get(LEVEL_CHANNEL_ID);
  if (!channel) return;

  // Level up embed
  const levelEmbed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('🎉 Level Up!')
    .setDescription(`${member} reached **Level ${newLevel}**!`)
    .addFields(
      { name: '📈 Previous Level', value: `${oldLevel}`, inline: true },
      { name: '🆙 New Level', value: `${newLevel}`, inline: true },
      { name: '💎 Total XP', value: `${userData[userId].xp}`, inline: true }
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await channel.send({ embeds: [levelEmbed] });

  // Check for role rewards
  await checkRoleRewards(member, newLevel);
}

// Check and assign role rewards
async function checkRoleRewards(member, level) {
  const guild = member.guild;
  
  for (const [levelReq, roleData] of Object.entries(LEVEL_ROLES)) {
    if (level >= parseInt(levelReq) && roleData.id) {
      const role = guild.roles.cache.get(roleData.id);
      if (role && !member.roles.cache.has(roleData.id)) {
        try {
          await member.roles.add(role);
          console.log(`Added role ${roleData.name} to ${member.user.tag}`);
        } catch (error) {
          console.error('Error adding role:', error);
        }
      }
    }
  }
}

// ==== READY EVENT ====
client.once('ready', async () => {
  console.log(`✅ Bot login sebagai ${client.user.tag}`);
  loadUserData();

  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    console.warn('❌ Guild tidak ditemukan.');
    return;
  }

  let channel = guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!channel || channel.type !== ChannelType.GuildText) {
    console.warn('❌ Channel welcome tidak ditemukan atau bukan text channel.');
    return;
  }

  const totalMembers = guild.memberCount;
  const verifiedCount = guild.members.cache.filter(m => m.roles.cache.has(ROLE_ID)).size;

  const embed = new EmbedBuilder()
    .setColor('#ff9900')
    .setTitle('🔒 Verifikasi Member')
    .setDescription(`🏠 **Total Member:** ${totalMembers}\n✅ **Terverifikasi:** ${verifiedCount}\n\n**Klik emoji ${VERIFY_EMOJI} di bawah untuk verifikasi dan mulai earning XP!**`)
    .addFields(
      { name: '🎮 Level System', value: 'Dapatkan XP dari:\n• 📝 Chat messages\n• 🎤 Voice activity\n• 👍 Giving reactions\n• 🎁 Daily bonuses', inline: false }
    )
    .setFooter({ text: 'Klik emoji untuk mendapatkan akses penuh ke server' });

  const message = await channel.send({ embeds: [embed] });
  await message.react(VERIFY_EMOJI);
  
  verifyMessageId = message.id;
  console.log(`✅ Pesan verifikasi terkirim di #${channel.name}`);

  // Start daily bonus checker
  setInterval(checkDailyBonuses, 60000); // Check every minute
});

// Check for daily bonuses
async function checkDailyBonuses() {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);

  for (const [userId, user] of Object.entries(userData)) {
    if (user.lastDaily < oneDayAgo) {
      const guild = client.guilds.cache.get(GUILD_ID);
      const member = guild?.members.cache.get(userId);
      
      if (member && member.presence?.status !== 'offline') {
        user.lastDaily = now;
        await addXP(userId, XP_CONFIG.DAILY_BONUS, 'Daily bonus');
      }
    }
  }
}

// ==== MESSAGE XP SYSTEM ====
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.guild?.id !== GUILD_ID) return;

  const userId = message.author.id;
  const now = Date.now();

  // Check cooldown
  if (messageCooldowns.has(userId)) {
    const expirationTime = messageCooldowns.get(userId) + XP_CONFIG.MESSAGE.cooldown;
    if (now < expirationTime) return;
  }

  messageCooldowns.set(userId, now);

  // Add message XP
  const xpGain = Math.floor(Math.random() * (XP_CONFIG.MESSAGE.max - XP_CONFIG.MESSAGE.min + 1)) + XP_CONFIG.MESSAGE.min;
  const user = await addXP(userId, xpGain, 'Message');
  user.totalMessages++;

  setTimeout(() => messageCooldowns.delete(userId), XP_CONFIG.MESSAGE.cooldown);
});

// ==== REACTION XP SYSTEM ====
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.message.guild?.id !== GUILD_ID) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Gagal fetch reaction:', error);
      return;
    }
  }

  // Verification system
  if (reaction.message.id === verifyMessageId && reaction.emoji.name === VERIFY_EMOJI) {
    await handleVerification(reaction, user);
    return;
  }

  // XP for giving reactions (not on verification message)
  if (reaction.message.id !== verifyMessageId) {
    await addXP(user.id, XP_CONFIG.REACTION_GIVE, 'Giving reaction');
    
    // XP for receiving reactions
    if (reaction.message.author && !reaction.message.author.bot) {
      await addXP(reaction.message.author.id, XP_CONFIG.REACTION_RECEIVE, 'Receiving reaction');
    }
  }
});

// Handle verification
async function handleVerification(reaction, user) {
  const guild = reaction.message.guild;
  if (!guild) return;

  const member = guild.members.cache.get(user.id);
  if (!member) return;

  const role = guild.roles.cache.get(ROLE_ID);
  if (!role) {
    console.error('❌ Role Verified tidak ditemukan.');
    return;
  }

  if (member.roles.cache.has(ROLE_ID)) return;

  try {
    await member.roles.add(role);
    console.log(`✅ ${user.tag} berhasil diverifikasi`);

    // Give verification XP bonus
    await addXP(user.id, 100, 'Verification bonus');

    await updateVerificationEmbed(guild);
  } catch (err) {
    console.error('Gagal menambahkan role:', err);
  }
}

// ==== VOICE XP SYSTEM ====
client.on('voiceStateUpdate', async (oldState, newState) => {
  const userId = newState.member.id;
  const now = Date.now();

  // User joined voice channel
  if (!oldState.channelId && newState.channelId) {
    voiceTracking[userId] = now;
  }
  
  // User left voice channel
  else if (oldState.channelId && !newState.channelId) {
    if (voiceTracking[userId]) {
      const timeSpent = now - voiceTracking[userId];
      const minutes = Math.floor(timeSpent / 60000);
      
      if (minutes > 0) {
        const xpGain = minutes * XP_CONFIG.VOICE_PER_MINUTE;
        const user = await addXP(userId, xpGain, `Voice activity (${minutes}m)`);
        user.voiceTime += timeSpent;
      }
      
      delete voiceTracking[userId];
    }
  }
});

// ==== COMMAND: PROFILE ====
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).split(' ');
  const command = args[0].toLowerCase();

  if (command === 'profile' || command === 'level') {
    const targetUser = message.mentions.users.first() || message.author;
    const userData = getUserData(targetUser.id);
    const nextLevelXP = getXPForLevel(userData.level + 1);
    const currentLevelXP = getXPForLevel(userData.level);
    const progress = userData.xp - currentLevelXP;
    const needed = nextLevelXP - currentLevelXP;

    const profileEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`📊 ${targetUser.username}'s Profile`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: '🎯 Level', value: `${userData.level}`, inline: true },
        { name: '💎 Total XP', value: `${userData.xp}`, inline: true },
        { name: '📈 Progress', value: `${progress}/${needed} XP`, inline: true },
        { name: '💬 Messages', value: `${userData.totalMessages}`, inline: true },
        { name: '🎤 Voice Time', value: `${Math.floor(userData.voiceTime / 60000)} minutes`, inline: true },
        { name: '📅 Member Since', value: `<t:${Math.floor(userData.joinedAt / 1000)}:R>`, inline: true }
      )
      .setTimestamp();

    await message.reply({ embeds: [profileEmbed] });
  }

  if (command === 'leaderboard' || command === 'top') {
    const sorted = Object.entries(userData)
      .sort(([,a], [,b]) => b.xp - a.xp)
      .slice(0, 10);

    let description = '';
    for (let i = 0; i < sorted.length; i++) {
      const [userId, data] = sorted[i];
      const user = client.users.cache.get(userId);
      if (user) {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        description += `${medal} **${user.username}** - Level ${data.level} (${data.xp} XP)\n`;
      }
    }

    const leaderboardEmbed = new EmbedBuilder()
      .setColor('#ffd700')
      .setTitle('🏆 Server Leaderboard')
      .setDescription(description || 'No data available')
      .setTimestamp();

    await message.reply({ embeds: [leaderboardEmbed] });
  }
});

// ==== OTHER EVENT HANDLERS ====
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      return;
    }
  }

  if (reaction.message.id !== verifyMessageId) return;
  if (reaction.emoji.name !== VERIFY_EMOJI) return;

  const guild = reaction.message.guild;
  if (!guild) return;

  const member = guild.members.cache.get(user.id);
  if (!member) return;

  const role = guild.roles.cache.get(ROLE_ID);
  if (!role || !member.roles.cache.has(ROLE_ID)) return;

  try {
    await member.roles.remove(role);
    console.log(`❌ ${user.tag} role verified dihapus`);
    await updateVerificationEmbed(guild);
  } catch (err) {
    console.error('Gagal menghapus role:', err);
  }
});

async function updateVerificationEmbed(guild) {
  const channel = guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!channel) return;

  try {
    const message = await channel.messages.fetch(verifyMessageId);
    if (!message) return;

    const totalMembers = guild.memberCount;
    const verifiedCount = guild.members.cache.filter(m => m.roles.cache.has(ROLE_ID)).size;

    const newEmbed = new EmbedBuilder()
      .setColor('#ff9900')
      .setTitle('🔒 Verifikasi Member')
      .setDescription(`🏠 **Total Member:** ${totalMembers}\n✅ **Terverifikasi:** ${verifiedCount}\n\n**Klik emoji ${VERIFY_EMOJI} di bawah untuk verifikasi dan mulai earning XP!**`)
      .addFields(
        { name: '🎮 Level System', value: 'Dapatkan XP dari:\n• 📝 Chat messages (15-25 XP)\n• 🎤 Voice activity (10 XP/min)\n• 👍 Giving reactions (5 XP)\n• 🎁 Daily bonuses (100 XP)', inline: false }
      )
      .setFooter({ text: 'Klik emoji untuk mendapatkan akses penuh ke server' });

    await message.edit({ embeds: [newEmbed] });
  } catch (error) {
    console.error('Gagal update embed:', error);
  }
}

client.on('guildMemberAdd', async (member) => {
  const guild = member.guild;
  await updateVerificationEmbed(guild);
  
  // Initialize user data for new member
  getUserData(member.id);
  saveUserData();
});

client.on('guildMemberRemove', async (member) => {
  const guild = member.guild;
  await updateVerificationEmbed(guild);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Saving user data before shutdown...');
  saveUserData();
  process.exit(0);
});

client.login(process.env.TOKEN);