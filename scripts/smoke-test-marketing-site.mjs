const origin = process.env.MARKETING_ORIGIN || 'https://gfcweather.com';
const response = await fetch(`${origin}/`, { redirect: 'manual' });
if (!response.ok) throw new Error(`Marketing homepage returned ${response.status}`);
const www = await fetch('https://www.gfcweather.com/pricing?source=smoke', { redirect: 'manual' });
if (www.status !== 308 || www.headers.get('location') !== 'https://gfcweather.com/pricing?source=smoke') {
  throw new Error(`www canonical redirect failed: ${www.status} ${www.headers.get('location')}`);
}
const app = await fetch(`${origin}/forecast?source=smoke`, { redirect: 'manual' });
if (app.status !== 308 || app.headers.get('location') !== 'https://app.gfcweather.com/forecast?source=smoke') {
  throw new Error(`Application route redirect failed: ${app.status} ${app.headers.get('location')}`);
}
console.log('Marketing Worker smoke checks passed.');
