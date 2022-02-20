#!/bin/bash

# IP:PORT
SERVER="localhost:9091"

# Flags to append to transmission-remote such as authentication (-n user:pass)
FLAGS=""

# Define path to debug file
DEBUG_FILE="transmission-dh_debug.log"

# Limit ratio on torrent until removing
RATIO=2.0

# Limit time in hours to hold a dead torrent until removal (In case a lot of torrents in queue)
DEAD_RETENTION=12

# Limit time in hours before remove torrent since it was added, default: 5 days
ADDED_RETENTION=120

# Available labels
LABELS="radarr|sonarr"

# Excluded trackers (Use with care)
TRACKERS=(Tracker1 Tracker1 Tracker3)

# Set to true in order to get debug data
DEBUG_DATA=false

# Verbose: console:0, file:1 , both:2
VERBOSE=2


