🎮 Who Am I? — Real-Time Multiplayer Guessing Game
Who Am I? is a real-time, 2-player character guessing game built as a full-stack web application.

Players create or join a private room, secretly choose a character, take turns asking Yes/No questions, eliminate characters that do not match the clues, and try to make the correct final guess before their opponent.

🔗 Live Demo: https://who-am-i-6a6e.onrender.com

✨ Features
👥 2-player real-time multiplayer
🔐 Create and join private game rooms
🔄 Turn-based question system
❓ Built-in and custom questions
🧠 Character deduction gameplay
❌ Character elimination system
🎯 Final guess mechanic
⏱️ 60-second turn timer
🏆 Score and winner system
🔁 Play-again / rematch system
⚡ Real-time synchronization using Socket.IO
📱 Responsive dark-themed game interface
🗂️ Multiple character categories
🗂️ Available Categories
The game currently supports:

Category	
🎌 Anime	Anime characters
🎮 Gaming	Gaming characters
🎬 Movies	Movie characters
📺 TV Shows	Television characters
🎵 Music	Music artists
🏆 Sports	Sports personalities
🦸 Superheroes	Superhero characters
👾 Video Games	Video game characters
📚 Books	Literary characters
🎤 K-Pop	K-Pop artists
The host selects the category from the game lobby before starting the match.

🎮 How to Play
1. Create a Game
One player creates a room and receives a 6-character room code.

2. Join the Game
The second player enters the room code to join the match.

3. Choose a Secret Character
Both players secretly select a character from the selected category.

Players can choose the same character. The game does not restrict duplicate selections.

4. Ask Questions
Players take turns asking questions that can be answered with YES or NO.

Examples:

Is your character human?
Is your character a villain?
Does your character use a sword?
Is your character from a popular series?
Does your character have supernatural abilities?
Players can also create their own custom questions.

5. Eliminate Characters
Use the character board to eliminate characters that do not fit the clues.

Eliminated characters are tracked separately for each player, so one player's deductions do not affect the opponent's board.

6. Make the Final Guess
When a player thinks they know the opponent's secret character, they can make a final guess.

✅ Correct guess → win the game and earn points.
❌ Wrong guess → lose 50 points and the turn passes to the opponent.
7. Rematch
After the game ends, either player can request another game.

A new round starts only when both players agree to play again.

🧠 Scoring
Correct guesses reward points based on how quickly the game is solved.

Maximum correct-guess score: 1200 points
Score decreases as game time passes
Minimum correct-guess reward: 100 points
Wrong final guess: -50 points
This encourages players to balance careful deduction with fast decision-making.

🛠️ Tech Stack
Frontend
HTML5
CSS3
Vanilla JavaScript
Backend
Node.js
Express.js
Socket.IO
Deployment
Render
🔒 Game State & Privacy
Secret character selections are stored on the server and are not intentionally exposed to the opponent during normal gameplay.

Each player also has an independent elimination list, allowing both players to make their own deductions without affecting each other's board.

⚠️ Disclaimer
This is a personal/educational game project.

Character names, images, fictional characters, and public-figure references belong to their respective copyright and trademark owners. This project is not affiliated with the owners of those properties.

👨‍💻 Developer
Built as a full-stack real-time multiplayer web development project.

If you try the game, feedback and suggestions are welcome!

🔗 Live Demo
https://who-am-i-6a6e.onrender.com

⭐ If you find the project interesting, consider starring the repository!
