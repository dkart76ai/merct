#set a default kingdom
if no in-game channel is set, do nothing/ no notifications (no default as can be dangerous, some1 may notice the bot)

#get available channel subscribed, and send to client so  a channel can be selected


store objects from a default kingdom, so it can be used as watchtower
each object must have a timeout (maybe the object timestamp can be used)
and change status to warning (10min), and delete (20min)

user via chat can send commands to query objects
ie: @list 5 crypts lvl 20
bot should get who wrote, find its coords, and give  a list of 5 crypts level 25, near to him

so command format should be @list [how much] [object type: use partial name] lvl [20]
lvl can be optional
search on default kingdom only

@find k=166 c=aow n=bandirgas //find player in kingdom 166 named bandirgas
case insensitive
clan optional
k optional, should use default if not specified

@ingots  // show a list of top 10 players with higher ingots from favorite kingdoms stored on db






all other kingdoms do not store objects, only players information

create periodic scanner for default kingdoms
- this will send 312 packets and extract and save players+objects
- objects will have an expiration time, and auto delete
- user would be able to send bot commands to search objects
- parameters for commands should be object name, level, amount (for objects)
- kingdom, name, clan name (for players)
* use as watchtower
*

create periodic scanner for favorites kingdoms
objective:
 * merc search on closer kingdoms
 * player search for gold ingot farming
 * shield status ,higher might>150m,, if goes off and less than 5 minutes from last scan, and gold-ingot is higher, probably resources is also higher, not playing, resources accumulated on his city


periodic task to populate player information if no available
(send 402 packets)


if scanner start, as soon as find a merc, send a notification



//----------
timer scan default kingdom -> worker_thread -> extract and save objects and players
timer get player information call job sendpacket 402 -> worker_thread -> save data
timer scan other kingdoms -> call job sendpacket 313,22,312 -> worker thread -> save players, notify if find mercs

