# MathMaster Live Challenge Audio V5

This package makes **Dark Arena Human** the default announcer and adds an original 16-bit console-era soundtrack.

## Music
- `lobby_neon_grid_loop` — calmer join/lobby music
- `round_battle_circuit_loop` — main gameplay loop
- `final_round_overdrive_loop` — faster final-round music
- `new_leader_stinger` — short transition cue
- `victory_champion_stinger` — end-of-game fanfare

Both WAV files for production and MP3 files for quick listening are included.

## Recommended repository location
Copy the extracted folder to:

`public/audio/live-challenge/v6/`

Then load:

`public/audio/live-challenge/v6/live-challenge-audio-manifest-v6.json`

## Recommended behavior
- Play music and announcements from the teacher/projector only.
- Use Dark Arena Human as the selected default announcer.
- Keep music around 24% volume.
- Duck music to approximately 10% while an announcer cue plays.
- Crossfade 650 ms when moving from lobby → round → final round.
- Do not restart the gameplay track after every question.


## 16-bit sound effects
This V6 package restores and upgrades game SFX:
- correct / wrong
- countdown tick / GO
- rank up / rank down
- overtake
- hot streak
- new leader burst
- round start
- final round alarm
- answer lock-in
- leaderboard shuffle
- tie
- victory sparkle

### Recommended mix
- Music: ~24%
- Announcer: ~82%
- Sound effects: ~62%
- Duck music to ~10% during announcer speech.
- Rate-limit rank movement sounds so rapid leaderboard movement does not create audio clutter.
- Global leaderboard SFX should come from the teacher/projector.
- Personal correct/wrong sounds on student Chromebooks should remain optional and off by default.
