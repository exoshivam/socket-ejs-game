// Call Break rules and scoring. Pure TS, no React: meant to move to a shared package.

export type Suit = '♠' | '♣' | '♥' | '♦';
export interface Card {
  suit: Suit;
  rank: string;
}
export interface TrickCard {
  playerIndex: number;
  playerName?: string;
  card: Card;
}

export const NUM_PLAYERS = 4;
export const CARDS_PER_PLAYER = 13;
export const TOTAL_ROUNDS = 5;
export const TRUMP_SUIT: Suit = '♠';
export const CARD_RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
export const CARD_SUITS: Suit[] = ['♠', '♣', '♥', '♦'];

const rankIndex = (c: Card) => CARD_RANKS.indexOf(c.rank);
export const sameCard = (a: Card, b: Card) => a.suit === b.suit && a.rank === b.rank;
export const isRed = (c: Card) => c.suit === '♥' || c.suit === '♦';

/** Sorted copy: by suit (♠ ♣ ♥ ♦), then rank high to low. */
export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort(
    (a, b) => CARD_SUITS.indexOf(a.suit) - CARD_SUITS.indexOf(b.suit) || rankIndex(a) - rankIndex(b),
  );
}

/**
 * Cards the player may play: any card when leading; otherwise a lead-suit card that
 * beats every lead-suit card in the trick, else any lead-suit card, else a spade, else anything.
 */
export function getPlayableCards(hand: Card[], trick: TrickCard[]): Card[] {
  if (trick.length === 0) return hand;
  const leadSuit = trick[0].card.suit;
  const highest = Math.min(...trick.filter(t => t.card.suit === leadSuit).map(t => rankIndex(t.card)));
  const sameSuit = hand.filter(c => c.suit === leadSuit);
  const higher = sameSuit.filter(c => rankIndex(c) < highest);
  if (higher.length) return higher;
  if (sameSuit.length) return sameSuit;
  const spades = hand.filter(c => c.suit === TRUMP_SUIT);
  return spades.length ? spades : hand;
}

/** Made the bid: bid + 0.1 per extra trick. Missed it: minus the bid. */
export function roundScore(bid: number, tricks: number): number {
  return tricks >= bid ? bid + (tricks - bid) * 0.1 : -bid;
}

/** Server seat index to this client's seat (0 = you, 1 = left, 2 = top, 3 = right). */
export function toClientIndex(serverIndex: number, myServerIndex: number): number {
  return (serverIndex - myServerIndex + NUM_PLAYERS) % NUM_PLAYERS;
}

/** Rotate a server-ordered list so this player is first. */
export function rotate<T>(list: T[], myServerIndex: number): T[] {
  return list.map((_, i) => list[(myServerIndex + i) % NUM_PLAYERS]);
}
