# Team Call Break: Official Rules (6 Players, 3 vs 3)

This document is the single authoritative rulebook for Team Call Break. Every client, server, and AI agent must follow it exactly. No rule may be changed during a match.

---

## 1. Game Overview

| Item | Value |
|---|---|
| Players | 6 |
| Teams | 2 teams of 3 players |
| Deck | 48 cards (standard 52-card deck with all four 2s removed) |
| Cards per player | 8 |
| Tricks per round | 8 |
| Rounds per match | 5 |
| Trump | One suit per round, chosen by the choosing team |
| Bidding | None |
| Objective | Win more rounds than the opposing team |

---

## 2. Glossary

- **Trick:** One card played by each of the six players, in turn. The trick is won by one player and counts for that player's team.
- **Led suit:** The suit of the first card played in a trick.
- **Trump suit:** The one suit chosen for the round. Any trump card beats any non-trump card.
- **Choosing team:** The team that selects trump in the current round.
- **Defending team:** The team that does not select trump in the current round.
- **Chooser:** The one player from the choosing team who selects trump.
- **Path A:** Selecting trump from the chooser's own first 5 cards.
- **Path B:** Turning the chooser's last 3 cards face-up and selecting trump from those cards only.
- **Void:** Holding no cards of a particular suit.

---

## 3. Cards

### 3.1 Deck
- Start with a standard 52-card deck.
- Remove the four 2s (2♠, 2♥, 2♦, 2♣) before every round.
- The removed 2s are publicly known. They are never in play.
- The round uses exactly 48 cards: 12 cards in each of the four suits.

### 3.2 Card ranks
From highest to lowest:

A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3

### 3.3 Suits
Spades (♠), Hearts (♥), Diamonds (♦), Clubs (♣). No suit ranks above another, except that the chosen trump suit beats all other suits during the round.

---

## 4. Teams and Seating

- **Team A:** Player 1, Player 3, Player 5
- **Team B:** Player 2, Player 4, Player 6
- Seating is clockwise: P1 → P2 → P3 → P4 → P5 → P6 → back to P1.
- Teammates therefore never sit next to each other.
- Each player plays their own cards. All tricks a player wins count for their team.

---

## 5. Choosing Team and Chooser Schedule

- The choosing team alternates every round, starting with Team A.
- The chooser rotates among the members of the choosing team.

| Round | Choosing team | Chooser | Defending team |
|---|---|---|---|
| 1 | Team A | Player 1 | Team B |
| 2 | Team B | Player 2 | Team A |
| 3 | Team A | Player 3 | Team B |
| 4 | Team B | Player 4 | Team A |
| 5 | Team A | Player 5 | Team B |

- Over a 5-round match, Team A chooses trump 3 times and Team B chooses 2 times.
- Player 6 does not act as chooser in a 5-round match.
- Each new match restarts this schedule from Round 1 (see Section 16 for the optional carry-over setting).

---

## 6. Round Setup

1. Remove the four 2s from the deck.
2. Shuffle the 48 remaining cards using a uniform random shuffle.
3. Deal **5 cards** to each of the six players (30 cards dealt).
4. Keep the remaining **18 cards** (3 per player) in reserve for the second deal.
5. Proceed to Trump Selection (Section 7).

The dealing order has no effect on gameplay in the digital version. The only requirement is that every possible card assignment is equally likely.

---

## 7. Trump Selection

### 7.1 Visibility after the first deal

| Player(s) | May see their 5 cards? |
|---|---|
| Chooser | Yes |
| Chooser's two teammates | **No**, hidden until allowed below |
| All three defending players | Yes |

No player may see any other player's cards.

### 7.2 The chooser's decision
The chooser looks at his 5 cards and selects **exactly one** of two paths:

- **Path A:** Choose trump from his own 5 cards.
- **Path B:** Open his last 3 cards and choose trump from those.

The decision is **final**. After selecting Path B, the chooser cannot return to Path A, even after seeing the opened cards.

### 7.3 Path A: Choose from own hand
1. The chooser names one trump suit.
2. The suit **must appear in at least one of his 5 cards**. The system must reject any suit he does not hold.
3. The trump suit is announced publicly to all six players.
4. Each player receives their remaining 3 cards from the reserve.
5. All six players may now see their full 8-card hands.
6. Gameplay begins (Section 8).

### 7.4 Path B: Open 3 cards
1. The chooser's 3 remaining cards are dealt **face-up**. All six players can see them.
2. The chooser's two teammates may now look at their first 5 cards.
3. The remaining 3 cards for each of the other five players are dealt:
   - Defending players may see their 3 new cards immediately.
   - The chooser's teammates' 3 new cards stay **face-down and unseen**.
4. The chooser names one trump suit. It **must be a suit that appears among the 3 opened cards**:
   - He can still see his first 5 cards, but their suits are eligible only if they also appear among the opened 3.
   - If all 3 opened cards are the same suit, that suit becomes trump automatically.
   - The system must reject any suit not shown on the opened cards.
5. The trump suit is announced publicly to all six players.
6. The 3 opened cards return to the chooser's hand and are no longer displayed. Other players may still remember them.
7. The chooser's teammates may now see their 3 face-down cards.
8. All six players now hold and can see their full 8-card hands.
9. Gameplay begins (Section 8).

### 7.5 Trump rules (both paths)
- There is exactly **one** trump suit per round, and it applies to all six players.
- The defending team cannot choose, reject, or change the trump suit.
- The trump suit cannot change for any reason during the round.
- The trump suit is displayed to all players throughout the round.
- Players may not communicate during trump selection. Teammates may not hint at what suit to choose.

---

## 8. Gameplay

### 8.1 Leading
- The **chooser leads the first trick** of the round.
- The winner of each trick leads the next trick.
- Any card may be led at any time, including a trump card. There is no requirement to wait for trump to be "broken."

### 8.2 Turn order
- Play proceeds clockwise from the leader.
- Each player plays exactly one card per trick.
- Only the active player may play a card. The system rejects plays made out of turn.

### 8.3 Following suit
- If a player holds **any** card of the led suit, they **must** play a card of that suit.
- A player is **never required** to play a higher card than the current winning card. Any card of the led suit is legal.
- If a player is **void** in the led suit, they may play **any card**: trump or any other suit, with no obligation either way.

### 8.4 Legal play summary

| Situation | Legal cards |
|---|---|
| Leading a trick | Any card in hand |
| Holding the led suit | Any card of the led suit |
| Void in the led suit | Any card in hand |

---

## 9. Trick Winner Determination

After all six cards of a trick are played:

1. If **one or more trump cards** were played, the **highest trump** wins.
2. If **no trump** was played, the **highest card of the led suit** wins.
3. A card that is neither trump nor the led suit can **never** win a trick.
4. No ties are possible, because each card exists only once.

### Examples (trump = ♥)
- Led ♣: ♣9, ♣K, ♦A, ♣3, ♠A, ♣10 → **♣K wins** (no trump played; ♦A and ♠A are off-suit).
- Led ♣: ♣9, ♣K, ♥4, ♣3, ♥J, ♣10 → **♥J wins** (highest trump).
- Led ♥: ♥5, ♥Q, ♠A, ♥3, ♥K, ♦A → **♥K wins** (trump was led; highest trump wins).

---

## 10. Round Result

### 10.1 Full play
- **All 8 tricks are always played**, even after the round result is already decided, because total tricks are used as the match tie-breaker.
- Team A tricks + Team B tricks = 8, always.

### 10.2 Targets

| Team | Draw | Win |
|---|---|---|
| Choosing team | exactly 5 tricks | 6 or more tricks |
| Defending team | exactly 3 tricks | 4 or more tricks |

### 10.3 Result table

| Choosing team tricks | Defending team tricks | Result |
|---|---|---|
| 8, 7, or 6 | 0, 1, or 2 | Choosing team wins |
| 5 | 3 | Draw |
| 4, 3, 2, 1, or 0 | 4, 5, 6, 7, or 8 | Defending team wins |

- Exactly one of these outcomes occurs in every round.
- Path A and Path B use the same targets. Choosing Path B has no extra penalty or bonus.
- Individual tricks won are tracked and displayed but do not affect scoring.

---

## 11. Match Scoring

### 11.1 Points per round

| Round result | Points |
|---|---|
| Win | 1 |
| Draw | 0 (both teams) |
| Loss | 0 |

### 11.2 Match winner
After Round 5:
1. The team with **more points** wins the match.
2. If points are tied, the team with **more total tricks across all 5 rounds** wins (40 tricks in total).
3. If total tricks are also tied (20–20), the match is a **draw**.

### 11.3 Early decision
- All 5 rounds are always played, even if one team has already secured the match. Remaining rounds can still affect total tricks and final standings.

---

## 12. Round Flow (Step by Step)

1. Identify the round number, choosing team, chooser, and defending team (Section 5).
2. Remove the 2s, shuffle, and deal 5 cards to each player.
3. Apply first-deal visibility (Section 7.1).
4. The chooser selects Path A or Path B.
5. Complete the selected path (Section 7.3 or 7.4) and announce trump.
6. Confirm all players hold exactly 8 cards and can see their full hands.
7. The chooser leads trick 1.
8. Play 8 tricks (Sections 8 and 9).
9. Count tricks per team and per player.
10. Determine the round result (Section 10) and award points (Section 11).
11. Display the round result and cumulative standings.
12. If fewer than 5 rounds have been played, start the next round. Otherwise, determine the match winner.

---

## 13. Information and Communication Rules

- Each player's hand is private.
- Publicly known information:
  - The removed 2s
  - The chooser and whether Path A or Path B was selected
  - The 3 opened cards (in Path B only)
  - The trump suit
  - Every card played to every trick
  - Trick counts per player and team
  - Round results and match standings
- Players may not exchange cards.
- Players may not reveal or hint at their hidden cards, including through chat, signals, or timing.
- The face-down cards of the chooser's teammates (Path B) must not be visible to anyone until trump is announced.

---

## 14. Validation Rules (System Must Enforce)

The system must reject:
- Any action by a player who is not the active player.
- Playing a card not in the player's hand.
- Playing a card twice.
- Not following the led suit while holding a card of that suit.
- In Path A, naming a trump suit not present in the chooser's 5 cards.
- In Path B, naming a trump suit not present among the 3 opened cards.
- Switching from Path B back to Path A.
- Changing the trump suit after it is announced.
- A trump choice by anyone other than the chooser.
- Any attempt by the chooser's teammates to view their cards before they are allowed.

The system must ensure:
- Each trick contains exactly 6 cards before it is resolved.
- Each round contains exactly 8 completed tricks.
- Each player ends the round with 0 cards.
- The sum of tricks won by both teams equals 8.

---

## 15. Disconnections and Reconnections

1. When a player disconnects, the game **pauses**.
2. If the player does not reconnect within the **timeout** (default 60 seconds), a **bot** takes over that player's seat.
3. The bot makes only legal moves under these rules. This includes acting as chooser (choosing a path and naming trump) if the disconnected player is the chooser.
4. When the player reconnects, they resume control at their next decision. Moves the bot already made cannot be undone.
5. Game state (hands, tricks, trump, scores) must never be lost because of a disconnection.
6. Bot-played tricks count fully for the player's team.

---

## 16. Display Requirements

The interface must show:
- Round number (1–5) and match score
- Choosing team, chooser, and defending team
- Trick targets for both teams for the current round
- The trump suit (once announced)
- The 3 opened cards during Path B selection
- The current trick and the cards played so far
- The active player
- Tricks won per player and per team in the current round
- Total tricks per team across the match
- Round results and final match result

---

## 17. Configuration Settings

These are the default values. All clients must use the same configuration, and settings may not change during a match.

| Setting | Default |
|---|---|
| Rounds per match | 5 |
| Removed cards | All four 2s |
| First deal / second deal | 5 cards / 3 cards |
| Choosing team draw / win target | 5 / 6+ |
| Defending team draw / win target | 3 / 4+ |
| Points per round win / draw / loss | 1 / 0 / 0 |
| Disconnect timeout | 60 seconds |
| Chooser rotation | Restarts each match (optional: carry over so Player 6 starts Team B's rotation in the next match) |

---

## 18. Frequently Asked Questions

**Can the chooser name a suit he doesn't hold in Path A?**
No. In Path A, trump must be a suit present in his 5 cards.

**Can the chooser look at the opened cards and then go back to Path A?**
No. Choosing Path B is final.

**In Path B, can the chooser pick a suit from his first 5 cards?**
Only if that suit also appears among the 3 opened cards.

**What if all 3 opened cards are the same suit?**
That suit is automatically trump.

**Do I have to play a higher card if I can?**
No. You only have to follow the led suit when you can.

**If I'm void in the led suit, do I have to play trump?**
No. You may play any card.

**Can trump be led on the first trick?**
Yes. Any card may be led at any time.

**Does a draw give either team a point?**
No. Draws give 0 points to both teams.

**Is the round stopped once the result is certain?**
No. All 8 tricks are always played.

**Can the defending team reject the trump suit?**
No. They must accept it.

**Does choosing Path B change the targets?**
No. The targets stay at 5/6+ for the choosing team and 3/4+ for the defending team.

**Are 2s used anywhere?**
No. They are removed from every round, and everyone knows they are out.

**What if both teams have equal points and equal total tricks after 5 rounds?**
The match is a draw.
