#!/bin/bash

source config.sh

MAIN_FUNC (){
    INIT_FUNC
    AVAILABLE_TORRENT_FUNC 
    REMOVE_FUNC
}

INIT_FUNC () {
    PS4='$LINENO: '
    
    # Create info arrays
    DEBUG_TORRENT_ARRAY=()
    REMOVE_TORRENT_ARRAY=()
    INFO_TORRENT_ARRAY=()
}

LOGGER_FUNC () {
	format=$1
	message=("${@:2}")

	if [[ $VERBOSE == 0 ]]; then
		printf "$format" "${message[@]}"
	fi
	if [[ $VERBOSE == 1 ]]; then
		printf "$format" "${message[@]}" >> $DEBUG_FILE
	fi
	if [[ $VERBOSE == 2 ]]; then
		printf "$format" "${message[@]}"
		printf "$format" "${message[@]}" >> $DEBUG_FILE
	fi
}


AVAILABLE_TORRENT_FUNC (){

    LOGGER_FUNC "%s" "$(echo -e "\n\n[INFO] Transmission data handler" `date +"%Y-%m-%d %T"`)"
    
    # Get an ID list of available torrents on the server
    TORRENT_LIST=$(transmission-remote $SERVER $FLAGS --list | sed -e '1d' -e '$d' | awk '{print $1}' | sed -e 's/[^0-9]*//g')
    INFO_TORRENT_ARRAY+=( "ID" "Status" "State" "Availability" "Label" "Ratio" "Added [H]" "Name")
    today_date=$(date +%s)
    # Loop through each torrent
    for torrent_id in $TORRENT_LIST
    do
        # Meta data - Extract data from $torrent_info
        torrent_info=$(transmission-remote $SERVER $FLAGS --torrent $torrent_id --info)
        torrent_label=$(basename $(echo "$torrent_info" | grep "Location: *" | sed 's/Location\:\s//i' | awk '{$1=$1};1'))
        torrent_trackers=$(echo "$torrent_info" | grep "Magnet: *" | sed 's/Magnet\:\s//i' | awk '{$1=$1};1')
    
        # Check so torrent is included in either radarr or sonarr before getting all meta data
        case !"${torrent_label}" in LABELS) continue;; esac
        
        # Check if tracker exists in excluded trackers
        if echo "${torrent_trackers}" | grep -q "$TRACKERS"; then
            continue
        fi
    
        
        torrent_name=$(echo "$torrent_info" | grep "Name: *" | sed 's/Name\:\s//i' | awk '{$1=$1};1')
        torrent_status=$(echo "$torrent_info" | grep "Done: *"  | sed 's/Percent Done\:\s//i' | awk '{$1=$1};1')
        torrent_state=$(echo "$torrent_info" | grep "State: *" | sed 's/State\:\s//i' | awk '{$1=$1};1')
        torrent_ratio=$(echo "$torrent_info" | grep "Ratio: *" | sed 's/Ratio\:\s//i' | awk '//{print $1}')
        torrent_availability=$(echo "$torrent_info" | grep "Availability: *" | sed 's/Availability\:\s//i'| sed 's/%//' | awk '//{print $1}')
        
        # Get from added date
        prev=$(date --date="$(echo "$torrent_info" | grep "Date added: *" | sed 's/Date added\:\s//i' | awk '{$1=$1};1')" +"%s")
        torrent_date_added=$(( ($today_date - $prev )/(60*60) ))
        
        if [[ "$torrent_ratio" == "None" ]]; then
           torrent_ratio="0"
        fi    
        # If the status is None!
        if [[ "$torrent_status" == *"nan%"* ]]; then
           torrent_status="0%"
        fi
        if [[ "$torrent_status" == *"nan%"* ]]; then
           torrent_status="0%"
        fi
        if [[ "$torrent_availability" == "None" || "$torrent_availability" == *"nan"* ]]; then
            torrent_availability="0.0"
        fi
        # Debug status - Logged towards transmission-dh_Debug.txt
        INFO_TORRENT_ARRAY+=("$torrent_id" "$torrent_status" "$torrent_state" "$torrent_availability" "$torrent_label" "$torrent_ratio" "$torrent_date_added" "$torrent_name")
        
         # Remove torrent if dead by checking error or availability is 0
        if (($(echo "${torrent_availability} ${100}" | awk '{print ($1 < $2)}'))) && [[ $ADDED_RETENTION -ge $DEAD_RETENTION ]]; then
            REMOVE_TORRENT_ARRAY+=("[Remove] ID: $torrent_id Torrent is Dead -> Removing $torrent_name")
            continue
        fi
        
        # Remove if ratio reached
        if (( $(echo "${torrent_ratio} ${RATIO}" | awk '{print ($1 >= $2)}') )); then  
            REMOVE_TORRENT_ARRAY+=("[Remove] ID: $torrent_id Torrent reached ratio $torrent_ratio -> Removing $torrent_name")
            continue
        fi    
        # Remove if Retention (TTL) reached
        if [[ $torrent_date_added -ge $ADDED_RETENTION ]]; then
            REMOVE_TORRENT_ARRAY+=("[Remove] ID: $torrent_id Torrent TTL reached, Time: $torrent_date_added hours ago -> Removing $torrent_name")
            continue
        fi  
    done
}

REMOVE_FUNC (){
    #Debug data
    if [[ $DEBUG_DATA == "true" ]]; then
		LOGGER_FUNC "\n%-5s %-8s %-12s %-12s %-8s %-5s %-10s %-120s" "${INFO_TORRENT_ARRAY[@]}"
		LOGGER_FUNC "\n%s" "${DEBUG_TORRENT_ARRAY[@]}"
	fi
	
    for each in "${REMOVE_TORRENT_ARRAY[@]}"
    do
		LOGGER_FUNC "\n%s" "$each"
		transmission-remote "$SERVER" "$FLAGS" --torrent "$(echo $each | awk '$2 ~ /ID:/ { print  $3}')" --remove-and-delete > /dev/null 2>&1
    done
    # Dummy to get a new line
    LOGGER_FUNC "\n" ""
}
# Call main function
MAIN_FUNC

