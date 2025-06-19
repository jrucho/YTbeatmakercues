# YouTube Beatmaker Cues - Chrome Extension

> This extension was inspired by the muscle memory workflow of the OP-Z, the versatility of Ableton Live, and the hands-on approach I developed over the years using the SP-404.

![Screenshot 2025-06-06 at 19 38 10](https://github.com/user-attachments/assets/fc70d22d-c90a-4b66-9c4a-b66f001cdcc5)

Mark cue points, loop audio/video, apply live effects, and customize your beatmaking experience on YouTube.

The **YouTube Beatmaker Cues** extension supports precise pitch adjustments, audio and video looping, effects toggling, and intuitive cue management. Use keyboard shortcuts or the detailed Advanced Panel for quick control.

## New in 1.3
* Works inside the YouTube iframe on [Samplette.io](https://samplette.io) and other `youtube-nocookie.com` embeds, even when the referrer is hidden. The toolbar becomes scrollable and MIDI features are disabled there.
* Minimal bar and advanced window become scrollable when space is limited
* Route audio to any available output device via the **Audio Out** dropdown ("Default output" preselected)
* Choose your microphone via the **Audio In** dropdown ("Default input" preselected)
* Choose a device from the **Monitor In** dropdown and toggle **Mon On/Off** to hear that source through your computer's default speakers. Monitoring starts off on each page load and stops cleanly when you navigate away.
* Output routing adjusts automatically when selecting a new device
* Lower latency when switching outputs using native sink routing when supported
* Input monitoring uses a separate low-latency `AudioContext` for minimal delay
* Advanced control buttons now display in two columns for easier access
* **Super Knob** scrolls cues using any MIDI CC. Endless encoders behave like
  regular 0–127 knobs for now. Hold **Shift** to reposition before continuing
  and choose a speed (1–3) in the MIDI mapping window. Speed **1** is the
  default, with **2** and **3** moving cues faster.
* Avoids duplicate initialization in YouTube iframes to prevent freezes
* Mic button cycles Off → Record (green) → Monitor (red) so you can hear the mic while capturing loops
* Adjust cue points live using a single MIDI knob

[https://www.instagram.com/reel/DKsfsPPMOxg/?igsh=NzkzdDVhajFrZWk1](https://www.instagram.com/reel/DKvE_jEseKd/?igsh=MTJra2M5Z3A5ZTM4aw==)

https://www.instagram.com/reel/DKvgj2TIICH/?igsh=Ym5xNDR0bXUzZXZj
(Thanks for the video Noche !)

The extension supports managing multiple sample packs at once. Use the multi-
select dropdown in the advanced panel to load several packs together or delete
unused ones. Creating a new pack only asks for a name; you can later import
kicks, hihats and snares using each row’s "Imp" button. Samples are stored in
the pack and persist between sessions. You can delete individual samples from
any pack; built-in samples remain protected, but extra ones you add to the
built-in pack can be removed.

Manage multiple compressors (Native, Tape Warm, Roland SP404OG) to shape your audio character. Adjust settings effortlessly through a user-friendly interface.

Integrate MIDI controllers with customizable mappings to trigger cues, samples, and effects directly.

Samples and cue points persist between sessions. Easily export loops, manage cues, and maintain workflow efficiency.

## Key Features

- 🎯 **Cue Points**  
  Set up to 10 visual cue points on any YouTube video. Use keyboard shortcuts or drag & drop markers.

- 🔁 **Audio & Video Loopers**
  Record loops in sync with video or audio. Use `R`, `S`, `D`, or `F` to control
  up to four separate audio loops. The first loop sets the tempo automatically;
  additional loops stay synced to that BPM. Double press a loop key to erase.
  Exporting downloads each loop with its BPM in the file name. Use `V` for the
  video looper.
  Press `P` to pause or resume all loops.

- 🎚️ **Pitch Control**  
  Independent pitch control for video and loop playback.

- 🎛️ **Live Effects**  
  Toggle EQ (`E`), Compressor (`C`), Reverb (`Q`), and Cassette (`W`) in real time.

- 👁️ **Minimal & Advanced UI**  
  Choose between a clean minimal bar or a full panel with all controls.

- 🥁 **Sample Kits**  
  Manage built-in and imported samples (kick, hihat, snare), randomize or load packs on demand.

- 🎹 **MIDI Support**
  Use your MIDI controller to trigger actions. Custom mappings are available via UI, including key and MIDI assignments for all four loopers.

- 🔄 **Super Knob**
  Select any cue via pad, keyboard, or MIDI note and twist the mapped knob to
  slide its position left or right. Endless encoders currently act like normal
  0–127 knobs for maximum stability. Hold Shift (or a MIDI shift note) to
  reposition, and choose a speed from 1 (default) to 3 in the MIDI mapping
  window. Any CC number can be assigned.

- 👇 **Touch Sequencer**  
  10 pads, 16-step sequencer, tap tempo, and BPM-based triggering.

## Installation

1. Download the latest version of the Extension.
2. Go to `chrome://extensions/` and enable **Developer Mode**.
3. Click **Load unpacked** and select the unzipped folder.
4. Refresh any YouTube tab and click on the extension UI to activate audio.

To create the downloadable archive yourself, run `bash build_release.sh`. The script outputs `ytbeatmakercues-<version>.zip`.

## Keyboard Shortcuts

| Action | Key |
|-------|-----|
| Set/Jump to Cue | Ctrl/Cmd + [1–0] |
| Audio Loopers | R / S / D / F |
| Video Looper | V |
| EQ Toggle | E |
| Compressor Toggle | C |
| Reverb Toggle | Q |
| Cassette Toggle | W |
| Undo / Redo | U / Cmd+U |
| Pause Loops | P |
| Export | Ctrl/Cmd + Enter |
| Pitch Down / Up | `,` / `.` |
| Random Cue | `-` |
| Blind Mode | B |
| Show Advanced Panel | A |

All loop keys and MIDI notes can be reassigned in the Key Mapping and MIDI Mapping windows.

## Touch Sequencer

- Press `T` to open
- Press `S` to start/stop
- Set cue points on pads or trigger them
- Use the 16-step grid to play cues rhythmically
- Tap tempo, erase steps, or close the window anytime

## Compressors

- **Native:** Hard, clear compression.
- **Ultra Tape:** Vintage saturation, SP303-inspired.
- **Bright Open:** Bright and clean compression with analog warmth.

> 🔊 *Tip: Reduce YouTube volume to ~40–50% for best effect with compression modes.*

## Support

💬 DM on Instagram: [@owae.ga](https://instagram.com/owae.ga)  
🎥 Video tutorial: [YouTube](https://youtu.be/1--CEtz9H_0)

📄 Manual [GoogleDoc](https://docs.google.com/document/d/1-36AdsgzwXt7Mt-YsxxTY9NqxipxE-XvGeUNbLmTUCA/mobilebasic?fbclid=PAQ0xDSwK0OPNleHRuA2FlbQIxMAABp8W6y8O5IC8MR0UyQuGRNqEzNzCuUWRdAmEsF2-PToglY4jHIou6FDSq2F2j_aem_v9J-pyC1j4Uvl0vfl8PemA)
---

© 2025 owae.ga — Build beats where you watch them.
