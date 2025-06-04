const { secondsToTime } = require('./utils');

test('converts seconds to time string', () => {
  expect(secondsToTime(0)).toBe('0:00');
  expect(secondsToTime(75)).toBe('1:15');
});
