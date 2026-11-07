// Run: npm run check
import assert from 'node:assert/strict';
import { getPlayableCards, roundScore, rotate, sortHand, toClientIndex, type Card } from './rules.ts';

const c = (rank: string, suit: Card['suit']): Card => ({ rank, suit });
const hand = [c('2', '♥'), c('K', '♥'), c('5', '♠'), c('A', '♦')];

assert.deepEqual(getPlayableCards(hand, []), hand, 'leader plays anything');
assert.deepEqual(getPlayableCards(hand, [{ playerIndex: 1, card: c('Q', '♥') }]), [c('K', '♥')], 'must beat lead suit');
assert.deepEqual(getPlayableCards(hand, [{ playerIndex: 1, card: c('A', '♥') }]), [c('2', '♥'), c('K', '♥')], 'follow suit if cannot beat');
assert.deepEqual(getPlayableCards(hand, [{ playerIndex: 1, card: c('3', '♣') }]), [c('5', '♠')], 'no suit: spade');
assert.deepEqual(getPlayableCards([c('2', '♥')], [{ playerIndex: 1, card: c('3', '♣') }]), [c('2', '♥')], 'no suit, no spade: any');

assert.equal(roundScore(3, 3), 3);
assert.equal(roundScore(3, 5).toFixed(1), '3.2');
assert.equal(roundScore(4, 2), -4);

assert.deepEqual(sortHand(hand).map(x => x.rank + x.suit), ['5♠', 'K♥', '2♥', 'A♦']);
assert.equal(toClientIndex(0, 2), 2);
assert.deepEqual(rotate(['a', 'b', 'c', 'd'], 1), ['b', 'c', 'd', 'a']);

console.log('rules ok');
