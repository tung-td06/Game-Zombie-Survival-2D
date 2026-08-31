import os
import math
import struct
import wave
import random

SAMPLE_RATE = 22050  # Balanced for quality and file size

def write_wav(filepath, samples):
    # Clamp samples to 16-bit signed PCM range
    clamped_samples = []
    for s in samples:
        val = int(max(-32768, min(32767, s * 32767)))
        clamped_samples.append(val)
    
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with wave.open(filepath, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(struct.pack(f'<{len(clamped_samples)}h', *clamped_samples))

# --- Procedural Synthesizers ---

def gen_noise(duration, amp_envelope):
    samples = []
    num_samples = int(duration * SAMPLE_RATE)
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        val = random.uniform(-1, 1) * amp_envelope(t)
        samples.append(val)
    return samples

def gen_sweep(duration, start_freq, end_freq, amp_envelope, osc_type="sine"):
    samples = []
    num_samples = int(duration * SAMPLE_RATE)
    phase = 0.0
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        # Exponential frequency interpolation
        frac = t / duration
        freq = start_freq * ((end_freq / start_freq) ** frac)
        phase += 2 * math.pi * freq / SAMPLE_RATE
        
        if osc_type == "sine":
            val = math.sin(phase)
        elif osc_type == "square":
            val = 1.0 if math.sin(phase) >= 0 else -1.0
        elif osc_type == "saw":
            val = 2.0 * (phase / (2 * math.pi) - math.floor(0.5 + phase / (2 * math.pi)))
        else:
            val = math.sin(phase)
            
        samples.append(val * amp_envelope(t))
    return samples

def gen_mixed(duration, noise_weight, tone_weight, start_freq, end_freq, amp_envelope, osc_type="sine"):
    samples = []
    num_samples = int(duration * SAMPLE_RATE)
    phase = 0.0
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        # Freq sweep
        frac = t / duration
        freq = start_freq * ((end_freq / start_freq) ** frac)
        phase += 2 * math.pi * freq / SAMPLE_RATE
        
        # Tone component
        if osc_type == "sine":
            tone_val = math.sin(phase)
        elif osc_type == "square":
            tone_val = 1.0 if math.sin(phase) >= 0 else -1.0
        elif osc_type == "saw":
            tone_val = 2.0 * (phase / (2 * math.pi) - math.floor(0.5 + phase / (2 * math.pi)))
        else:
            tone_val = math.sin(phase)
            
        # Noise component
        noise_val = random.uniform(-1, 1)
        
        val = (noise_val * noise_weight + tone_val * tone_weight) * amp_envelope(t)
        samples.append(val)
    return samples

# --- Specific SFX Envelopes and Generators ---

def create_shoot(name, duration, start_f, end_f, noise_w, tone_w, osc_type="sine"):
    # Envelope: Instant attack, fast exponential decay
    def env(t):
        return math.exp(-12.0 * t)
    return gen_mixed(duration, noise_w, tone_w, start_f, end_f, env, osc_type)

def create_reload_click(duration=0.1, pitch=800):
    def env(t):
        if t < 0.01:
            return t / 0.01
        return math.exp(-40.0 * (t - 0.01))
    return gen_mixed(duration, 0.4, 0.6, pitch, pitch * 0.7, env)

def create_reload_sequence(weapon_type):
    # Construct a compound sound with multiple mechanical clicks spaced out
    click1 = create_reload_click(0.08, 1000)   # Magazine out
    silence = [0.0] * int(0.12 * SAMPLE_RATE)
    click2 = create_reload_click(0.08, 600)    # Magazine in
    silence2 = [0.0] * int(0.10 * SAMPLE_RATE)
    click3 = create_reload_click(0.1, 1200)    # Chamber lock / slide / bolt / pump
    return click1 + silence + click2 + silence2 + click3

def create_empty_click():
    def env(t):
        return math.exp(-150.0 * t)
    return gen_sweep(0.05, 2000, 1800, env)

def create_ui_click():
    def env(t):
        return math.exp(-30.0 * t)
    return gen_sweep(0.08, 900, 1300, env, "sine")

def create_ui_hover():
    def env(t):
        return 0.15 * math.exp(-40.0 * t)
    return gen_sweep(0.05, 440, 440, env, "sine")

def create_ui_purchase():
    # Arpeggio: C5 -> E5 -> G5 -> C6
    s1 = gen_sweep(0.05, 523.25, 523.25, lambda t: 0.3 * math.exp(-10.0 * t))
    s2 = gen_sweep(0.05, 659.25, 659.25, lambda t: 0.3 * math.exp(-10.0 * t))
    s3 = gen_sweep(0.05, 783.99, 783.99, lambda t: 0.3 * math.exp(-10.0 * t))
    s4 = gen_sweep(0.15, 1046.50, 1046.50, lambda t: 0.3 * math.exp(-15.0 * t))
    return s1 + s2 + s3 + s4

def create_ui_purchase_failed():
    # Downward buzzing error
    def env(t):
        return 0.4 * math.exp(-8.0 * t)
    return gen_sweep(0.25, 130, 90, env, "square")

def create_zombie_hit():
    def env(t):
        return math.exp(-15.0 * t)
    return gen_mixed(0.12, 0.8, 0.2, 200, 80, env)

def create_zombie_die():
    def env(t):
        return math.exp(-6.0 * t)
    return gen_mixed(0.35, 0.7, 0.3, 150, 50, env, "saw")

def create_player_hit():
    def env(t):
        return 0.5 * math.exp(-8.0 * t)
    return gen_mixed(0.20, 0.4, 0.6, 180, 100, env, "saw")

def create_explosion():
    def env(t):
        return math.exp(-4.0 * t)
    return gen_mixed(0.6, 0.9, 0.1, 100, 30, env)

def create_levelup():
    # Ascending chord sweep
    def env(t):
        return 0.3 * math.exp(-5.0 * t)
    s1 = gen_sweep(0.1, 523.25, 659.25, env)
    s2 = gen_sweep(0.1, 659.25, 783.99, env)
    s3 = gen_sweep(0.1, 783.99, 1046.50, env)
    s4 = gen_sweep(0.25, 1046.50, 1318.51, lambda t: 0.4 * math.exp(-6.0 * t))
    return s1 + s2 + s3 + s4

def create_pickup():
    def env(t):
        return 0.25 * math.exp(-12.0 * t)
    return gen_sweep(0.15, 880, 1320, env, "sine")

def create_boss_roar():
    samples = []
    duration = 1.0
    num_samples = int(duration * SAMPLE_RATE)
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        # Volume envelope
        amp = 0.5 * (1.0 - math.exp(-10.0 * t)) * math.exp(-1.5 * t)
        # Low frequency vibrato
        vibrato = 1.0 + 0.12 * math.sin(2 * math.pi * 12.0 * t)
        freq = 80.0 * vibrato * (1.0 - 0.3 * t)
        val = (0.7 * random.uniform(-1, 1) + 0.3 * math.sin(2 * math.pi * freq * t)) * amp
        samples.append(val)
    return samples

def create_wind_ambience():
    # 2.0 seconds of loopable wind
    samples = []
    duration = 2.0
    num_samples = int(duration * SAMPLE_RATE)
    # Generate low frequency noise
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        # Wind gusting volume modulation (sine wave + some random)
        gust = 0.15 + 0.1 * math.sin(2 * math.pi * 0.5 * t) + 0.05 * math.sin(2 * math.pi * 1.8 * t)
        val = random.uniform(-1, 1) * gust
        samples.append(val)
    
    # Apply a simple moving average lowpass filter to make it sound muffled/wind-like
    filtered = []
    window = 10
    for i in range(len(samples)):
        s = 0.0
        count = 0
        for w in range(-window, window + 1):
            idx = i + w
            if 0 <= idx < len(samples):
                s += samples[idx]
                count += 1
        filtered.append(s / count)
    return filtered

def create_music_loop(theme_type):
    # A simple 4.0 second loopable 8-bit theme
    # BPM = 120 -> 2 beats per second -> 8 beats total
    duration = 4.0
    num_samples = int(duration * SAMPLE_RATE)
    samples = [0.0] * num_samples
    
    # 120 BPM -> 0.5s per beat
    beat_samples = int(0.5 * SAMPLE_RATE)
    
    # Melodic patterns (MIDI note numbers converted to Freq)
    # A2=110Hz, C3=130Hz, D3=146Hz, F3=174Hz
    if theme_type == "gameplay":
        bassline = [55, 55, 65, 73, 55, 55, 87, 73]  # MIDI pitches approx
        melody = [110, 110, 130, 146, 110, 110, 174, 146]
    elif theme_type == "menu":
        bassline = [48, 48, 52, 55, 48, 48, 57, 55]  # calmer Am/C chord base
        melody = [96, 96, 104, 110, 96, 96, 114, 110]
    elif theme_type == "boss":
        bassline = [40, 44, 40, 44, 40, 44, 47, 45]  # faster, tense
        melody = [80, 88, 80, 88, 80, 88, 94, 90]
    else:  # pause
        bassline = [48, 48, 48, 48, 48, 48, 48, 48]
        melody = [96, 96, 96, 96, 96, 96, 96, 96]
        
    for beat in range(8):
        beat_start = beat * beat_samples
        
        # Bass synth
        bass_note = bassline[beat % len(bassline)]
        freq = 440.0 * (2.0 ** ((bass_note - 69) / 12.0))
        for j in range(beat_samples):
            idx = beat_start + j
            if idx >= num_samples: break
            t = j / SAMPLE_RATE
            env = 0.05 * math.exp(-5.0 * t)  # soft decay
            samples[idx] += (1.0 if math.sin(2 * math.pi * freq * t) >= 0 else -1.0) * env
            
        # Melody synth
        mel_note = melody[beat % len(melody)]
        mel_freq = 440.0 * (2.0 ** ((mel_note - 69) / 12.0))
        for j in range(beat_samples):
            idx = beat_start + j
            if idx >= num_samples: break
            t = j / SAMPLE_RATE
            env = 0.03 * math.exp(-3.0 * t)
            samples[idx] += math.sin(2 * math.pi * mel_freq * t) * env
            
        # Soft noise hit-hat on offbeat (half beat)
        hihat_start = beat_start + beat_samples // 2
        for j in range(beat_samples // 4):
            idx = hihat_start + j
            if idx >= num_samples: break
            t = j / SAMPLE_RATE
            env = 0.015 * math.exp(-40.0 * t)
            samples[idx] += random.uniform(-1, 1) * env
            
    return samples

# --- Generate All Assets ---

def main():
    print("Generating audio assets procedurally...")
    
    # Group file definitions
    assets = {
        # Weapons
        "weapons/pistol/shoot.wav": create_shoot("pistol", 0.15, 800, 200, 0.3, 0.7, "sine"),
        "weapons/pistol/reload.wav": create_reload_sequence("pistol"),
        "weapons/pistol/empty.wav": create_empty_click(),
        
        "weapons/smg/shoot.wav": create_shoot("smg", 0.10, 1000, 300, 0.4, 0.6, "sine"),
        "weapons/smg/reload.wav": create_reload_sequence("smg"),
        "weapons/smg/empty.wav": create_empty_click(),
        
        "weapons/rifle/shoot.wav": create_shoot("rifle", 0.20, 600, 120, 0.5, 0.5, "square"),
        "weapons/rifle/reload.wav": create_reload_sequence("rifle"),
        "weapons/rifle/empty.wav": create_empty_click(),
        
        "weapons/shotgun/shoot.wav": create_shoot("shotgun", 0.35, 400, 60, 0.7, 0.3, "sine"),
        "weapons/shotgun/reload.wav": create_reload_sequence("shotgun"),
        "weapons/shotgun/pump.wav": create_reload_click(0.12, 450),
        "weapons/shotgun/empty.wav": create_empty_click(),
        
        "weapons/sniper/shoot.wav": create_shoot("sniper", 0.50, 500, 50, 0.6, 0.4, "sine"),
        "weapons/sniper/reload.wav": create_reload_sequence("sniper"),
        "weapons/sniper/bolt.wav": create_reload_click(0.14, 550),
        "weapons/sniper/empty.wav": create_empty_click(),
        
        # UI
        "ui/click.wav": create_ui_click(),
        "ui/hover.wav": create_ui_hover(),
        "ui/back.wav": create_ui_click(),
        "ui/pause_open.wav": create_ui_click(),
        "ui/pause_close.wav": create_ui_click(),
        "ui/tab_switch.wav": create_ui_click(),
        "ui/slider_change.wav": create_ui_hover(),
        "ui/purchase.wav": create_ui_purchase(),
        "ui/purchase_failed.wav": create_ui_purchase_failed(),
        "ui/equip.wav": create_ui_click(),
        "ui/save.wav": create_ui_purchase(),
        "ui/load.wav": create_ui_purchase(),
        "ui/notification.wav": create_ui_purchase(),
        "ui/error.wav": create_ui_purchase_failed(),
        "ui/confirmation.wav": create_ui_purchase(),
        
        # Player
        "player/damage.wav": create_player_hit(),
        "player/death.wav": create_zombie_die(),
        "player/heal.wav": create_pickup(),
        "player/pickup.wav": create_pickup(),
        "player/levelup.wav": create_levelup(),
        "player/dash.wav": create_shoot("dash", 0.08, 600, 300, 0.2, 0.8),
        "player/ability.wav": create_levelup(),
        "player/reload.wav": create_reload_click(0.12, 800),
        "player/lowhp.wav": gen_sweep(0.1, 150, 150, lambda t: 0.2 * math.sin(2 * math.pi * 5.0 * t)),
        "player/footstep1.wav": gen_mixed(0.06, 0.9, 0.1, 80, 40, lambda t: 0.1 * math.exp(-35.0 * t)),
        "player/footstep2.wav": gen_mixed(0.06, 0.9, 0.1, 90, 45, lambda t: 0.1 * math.exp(-35.0 * t)),
        
        # Enemy
        "enemy/spawn.wav": create_pickup(),
        "enemy/alert.wav": create_boss_roar(),
        "enemy/attack.wav": create_player_hit(),
        "enemy/hit.wav": create_zombie_hit(),
        "enemy/death.wav": create_zombie_die(),
        "enemy/boss_spawn.wav": create_boss_roar(),
        "enemy/boss_death.wav": create_zombie_die(),
        
        # Impacts
        "impacts/bullet_hit_enemy.wav": create_zombie_hit(),
        "impacts/bullet_hit_wall.wav": create_shoot("hit_wall", 0.08, 1200, 400, 0.95, 0.05),
        "impacts/bullet_hit_metal.wav": create_shoot("hit_metal", 0.06, 2500, 1500, 0.5, 0.5),
        "impacts/bullet_hit_ground.wav": create_shoot("hit_ground", 0.08, 600, 200, 0.98, 0.02),
        "impacts/critical_hit.wav": create_levelup(),
        "impacts/enemy_death.wav": create_zombie_die(),
        
        # Ambience
        "ambience/wind.wav": create_wind_ambience(),
        
        # Music
        "music/menu.ogg": create_music_loop("menu"),
        "music/gameplay.ogg": create_music_loop("gameplay"),
        "music/boss.ogg": create_music_loop("boss"),
        "music/pause.ogg": create_music_loop("pause"),
    }
    
    # Destination directories
    roots = [
        "d:/Game Zombie Survival 2D/audio",
        "d:/Game Zombie Survival 2D/web/public/audio"
    ]
    
    for relative_path, samples in assets.items():
        for r_dir in roots:
            dest = os.path.join(r_dir, relative_path.replace("/", os.sep))
            write_wav(dest, samples)
            
    # Write README.md under root/audio/
    readme_path = os.path.join("d:/Game Zombie Survival 2D/audio", "README.md")
    readme_content = """# Retro 2D Zombie Survival - Audio Assets

All sound effects and music tracks in this directory are procedurally generated by the development environment's `generate-audio.py` script.

## Metadata & License

- **Source**: Procedurally Synthesized (Pure Python `math` + `struct` + `wave` modules)
- **Author**: Antigravity AI Code Assistant
- **License**: Creative Commons Zero v1.0 Universal (CC0 - Public Domain)
- **URL**: None (Locally generated offline)
- **Format**: 16-bit Mono PCM WAV (Music loops named `.ogg` for platform capability, but contain standard decodable WAV structures).
"""
    os.makedirs(os.path.dirname(readme_path), exist_ok=True)
    with open(readme_path, "w", encoding="utf-8") as f:
        f.write(readme_content)
        
    print("Successfully generated all audio files in:")
    for r_dir in roots:
        print(f" - {r_dir}")

if __name__ == "__main__":
    main()
