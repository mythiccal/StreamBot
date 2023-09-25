import { Client, TextChannel, CustomStatus, ActivityOptions, WebEmbed } from "discord.js-selfbot-v13";
import { command, streamLivestreamVideo, MediaUdp, setStreamOpts, streamOpts, Streamer } from "@dank074/discord-video-stream";
import config from "./config.json";
import fs from 'fs';
import path from 'path';
import ytdl from '@distube/ytdl-core';


const streamer = new Streamer(new Client({checkUpdate: false,}));

setStreamOpts(
    config.streamOpts
)

const prefix = config.prefix;

const moviesFolder = config.movieFolder || './movies';

const movieFiles = fs.readdirSync(moviesFolder);
let movies = movieFiles.map(file => {
  const fileName = path.parse(file).name;
  // replace space with _
  return { name: fileName.replace(/ /g, ''), path: path.join(moviesFolder, file) };
});

// print out all movies
console.log(`Available movies:\n${movies.map(m => m.name).join('\n')}`);

const status_idle = () =>  {
    return new CustomStatus()
    .setState('Watching Something!')
    .setEmoji('📽')
}

const status_watch = (name) => {
    return new CustomStatus()
    .setState(`Playing ${name}...`)
    .setEmoji('📽')
}

// ready event
streamer.client.on("ready", () => {
    if (streamer.client.user) {
        console.log(`--- ${streamer.client.user.tag} is ready ---`);
        streamer.client.user.setActivity(status_idle() as ActivityOptions)
    }
});

let streamStatus = {
    joined: false,
    joinsucc: false,
    playing: false,
    channelInfo: {
        guildId: '',
        channelId: '',
        cmdChannelId: ''
    },
    starttime: "00:00:00",
    timemark: '',
}

streamer.client.on('voiceStateUpdate', (oldState, newState) => {
    // when exit channel
    if (oldState.member?.user.id == streamer.client.user?.id) {
        if (oldState.channelId && !newState.channelId) {
            streamStatus.joined = false;
            streamStatus.joinsucc = false;
            streamStatus.playing = false;
            streamStatus.channelInfo = {
                guildId: '',
                channelId: '',
                cmdChannelId: streamStatus.channelInfo.cmdChannelId
            }
            streamer.client.user?.setActivity(status_idle() as ActivityOptions)
        }
    }
    // when join channel success
    if (newState.member?.user.id == streamer.client.user?.id) {
        if (newState.channelId && !oldState.channelId) {
            streamStatus.joined = true;
            if (newState.guild.id == streamStatus.channelInfo.guildId && newState.channelId == streamStatus.channelInfo.channelId) {
                streamStatus.joinsucc = true;
            }
        }
    }
})

streamer.client.on('messageCreate', async (message) => {
    if (message.author.bot) return; // ignore bots
    if (message.author.id == streamer.client.user?.id) return; // ignore self
    if (!config.commandChannel.includes(message.channel.id)) return; // ignore non-command channels
    if (!message.content.startsWith(prefix)) return; // ignore non-commands
    
    const args = message.content.slice(prefix.length).trim().split(/ +/); // split command and arguments
    if (args.length == 0) return;

    const user_cmd = args.shift()!.toLowerCase();
    const [guildId, channelId] = [config.guildId, config.videoChannel];


    if (config.commandChannel.includes(message.channel.id)) {
        switch (user_cmd) {
            case 'play':
                if (streamStatus.joined) {
                    message.reply('Already joined');
                    return;
                }
                
                // get movie name and find movie file
                let moviename = args.shift()
                let movie = movies.find(m => m.name == moviename);
                
                if (!movie) {
                    message.reply('Movie not found');
                    return;
                }
                
                // get start time from args "hh:mm:ss"
                let startTime = args.shift() || '';
                let options = {}
                // check if start time is valid
                // Validate start time format
                const startTimeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/; 

                if (startTime && !startTimeRegex.test(startTime)) {
                message.reply('Invalid start time format');
                return;
                }

                // Split and parse start time  
                const startTimeParts = startTime!.split(':');
                
                
                let hours = 0; 
                let minutes = 0;
                let seconds = 0;

                if (startTimeParts.length === 3) {
                hours = parseInt(startTimeParts[0], 10);
                minutes = parseInt(startTimeParts[1], 10); 
                seconds = parseInt(startTimeParts[2], 10);
                }

                if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
                message.reply('Invalid start time');
                return;
                }

                // Calculate total seconds
                const startTimeSeconds = hours * 3600 + minutes * 60 + seconds; 

                options['-ss'] = startTimeSeconds;

                await streamer.joinVoice(guildId, channelId);
                streamStatus.joined = true;
                streamStatus.playing = false;
                streamStatus.starttime = startTime;
                streamStatus.channelInfo = {
                    guildId: guildId,
                    channelId: channelId,
                    cmdChannelId: message.channel.id
                }
                const streamUdpConn = await streamer.createStream();
                playVideo(movie.path, streamUdpConn, options);
                message.reply('Playing ( `' + moviename + '` )...');
                streamer.client.user?.setActivity(status_watch(moviename) as ActivityOptions)
                break;
            case 'playlink':               
                if (streamStatus.joined) {
                    message.reply('**Already joined**');
                    return;
                } 
                let link = args.shift() || '';
                if (!link) {
                    message.reply('**Please provide a direct link/Youtube Link.**')
                    return;
                }

                let linkstartTime = args.shift() || '';
                let linkOptions = {}
                await streamer.joinVoice(guildId, channelId);

                streamStatus.joined = true;
                streamStatus.playing = false;
                streamStatus.starttime = linkstartTime;
                streamStatus.channelInfo = {
                    guildId: guildId,
                    channelId: channelId,
                    cmdChannelId: message.channel.id
                }
                
                
                const streamLinkUdpConn = await streamer.createStream();   
                if (ytdl.validateURL(link)) {
                    const yturl = await getVideoUrl(link).catch(error => {
                        console.error("Error:", error);
                    });
                
                    if (yturl) {
                        playVideo(yturl, streamLinkUdpConn, linkOptions);
                    }
                } else {
                    playVideo(link, streamLinkUdpConn, linkOptions);
                }                        
                 

                message.reply('Playing...');
                streamer.client.user?.setActivity(status_watch("") as ActivityOptions)
        
                break;            
            case 'stop':
                // Implement your stop playing logic here
                if(!streamStatus.joined) {
                    message.reply('**Already Stopped!**');
                    return;
                }
                streamer.leaveVoice()
                streamStatus.joined = false;
                streamStatus.joinsucc = false;
                streamStatus.playing = false;
                streamStatus.channelInfo = {
                    guildId: '',
                    channelId: '',
                    cmdChannelId: streamStatus.channelInfo.cmdChannelId
                }
                // use sigquit??
                command?.kill("SIGINT");
                // msg
                message.reply('**Stopped playing.**');
                break;  
            case 'playtime': //        not working correctly for now
                let start = streamStatus.starttime.split(':');
                let mark = streamStatus.timemark.split(':');
                let h = parseInt(start[0]) + parseInt(mark[0]);
                let m = parseInt(start[1]) + parseInt(mark[1]);
                let s = parseInt(start[2]) + parseInt(mark[2]);
                if (s >= 60) {
                    m += 1;
                    s -= 60;
                }
                if (m >= 60) {
                    h += 1;
                    m -= 60;
                }
                message.reply(`Play time: ${h}:${m}:${s}`);
                break;               
            case 'pause':
                if (!streamStatus.playing) {
                    command?.kill("SIGSTOP");
                    message.reply('Paused');
                    streamStatus.playing = false;
                } else {
                    message.reply('Not playing');
                }
                break;
            case 'resume':
                if (!streamStatus.playing) {
                    command?.kill("SIGCONT");
                    message.reply('Resumed');
                    streamStatus.playing = true;
                } else {
                    message.reply('Not playing');
                }
                break;
            case 'list':
                message.reply(`Available movies:\n${movies.map(m => m.name).join('\n')}`);
                break;
            case 'status':
                message.reply(`Joined: ${streamStatus.joined}\nPlaying: ${streamStatus.playing}`);
                break;
            case 'refresh':
                // refresh movie list
                const movieFiles = fs.readdirSync(moviesFolder);
                movies = movieFiles.map(file => {
                    const fileName = path.parse(file).name;
                    // replace space with _
                    return { name: fileName.replace(/ /g, ''), path: path.join(moviesFolder, file) };
                });
                message.reply('Movie list refreshed ' + movies.length + ' movies found.\n' + movies.map(m => m.name).join('\n'));
                break;
            case 'help':
                const commands = {
                    play: {
                      description: 'Play a movie',
                      usage: 'play [movie name]',
                    },

                    playlink: {
                        description: 'Play a movie/video/stream direct link or from youtube link',
                        usage: 'playlink [link]',
                    },

                    stop: {
                      description: 'Stop the current playing movie',
                      usage: 'stop'
                    },  
                    
                    pause: {
                      description: 'Pause the currently playing movie',
                      usage: 'pause'
                    },
                    
                    resume: {
                      description: 'Resume the paused movie',
                      usage: 'resume'
                    },

                    list: {
                        description: 'Get available movie list',
                        usage: 'list'
                    },

                    refresh: {
                        description: 'Refresh movie list.',
                        usage: 'refresh'
                    },

                    status: {
                        description: 'Get bot status.',
                        usage: 'status'
                    },
                  
                    help: {
                      description: 'Show this help message',
                      usage: 'help' 
                    }
                }
                  
                
                let help = 'Available commands:\n\n';

                for (const [name, cmd] of Object.entries(commands)) {
                  help += `**${name}: ${cmd.description}**\n`;
                  help += `Usage: \`${prefix}${cmd.usage}\`\n`;                                   
                  
                }
                                  
                // reply all commands here
                message.reply(help);
                break;
            default:
                message.reply('**Invalid command**');
        }
    }
});

streamer.client.login(config.token);

let lastPrint = "";

async function playVideo(video: string, udpConn: MediaUdp, options: any) {
    console.log("Started playing video");

    udpConn.mediaConnection.setSpeaking(true);
    udpConn.mediaConnection.setVideoStatus(true);
    try {
        let videoStream = streamLivestreamVideo(video, udpConn, options);
        command?.on('progress', (msg) => {
            // print timemark if it passed 10 second sionce last print, becareful when it pass 0
            if (streamStatus.timemark) {
                if (lastPrint != "") {
                    let last = lastPrint.split(':');
                    let now = msg.timemark.split(':');
                    // turn to seconds
                    let s = parseInt(now[2]) + parseInt(now[1]) * 60 + parseInt(now[0]) * 3600;
                    let l = parseInt(last[2]) + parseInt(last[1]) * 60 + parseInt(last[0]) * 3600;
                    if (s - l >= 10) {
                        console.log(`Timemark: ${msg.timemark}`);
                        lastPrint = msg.timemark;
                    }
                } else {
                    console.log(`Timemark: ${msg.timemark}`);
                    lastPrint = msg.timemark;
                }
            }
            streamStatus.timemark = msg.timemark;
        });
        const res = await videoStream;
        console.log("Finished playing video " + res);
    } catch (e) {
        console.log(e);
    } finally {
        udpConn.mediaConnection.setSpeaking(false);
        udpConn.mediaConnection.setVideoStatus(false);
    }
    command?.kill("SIGINT");
    // send message to channel, not reply
    (streamer.client.channels.cache.get(streamStatus.channelInfo.cmdChannelId) as TextChannel).send('**Finished playing video.**');
    streamer.leaveVoice();
    streamer.client.user?.setActivity(status_idle() as ActivityOptions)
    streamStatus.joined = false;
    streamStatus.joinsucc = false;
    streamStatus.playing = false;
    lastPrint = ""
    streamStatus.channelInfo = {
        guildId: '',
        channelId: '',
        cmdChannelId: ''
    }
}

async function getVideoUrl(videoUrl: string) {
    const video = await ytdl.getInfo(videoUrl);

    const videoFormats = video.formats
        .filter((format: { hasVideo: any; hasAudio: any; }) => format.hasVideo && format.hasAudio)
        .filter(format => format.container === 'mp4');

    return videoFormats[0].url;
}
  

// run server if enabled in config
if (config.server.enabled) {
    // run server.js
    require('./server');
}