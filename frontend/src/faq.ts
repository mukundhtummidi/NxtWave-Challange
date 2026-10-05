// "Questions students ask" — edit the FAQ here. This is the only place the text lives.
// Order in this array is the order shown on the page.
export type FaqItem = { q: string; a: string };

export const FAQ: FaqItem[] = [
  {
    q: "Who is this workshop for?",
    a: "Third and fourth year engineering students from any branch. You do not need to be a CSE student.",
  },
  {
    q: "Is it really free?",
    a: "Yes. Registering gives you a hall ticket and costs nothing.",
  },
  {
    q: "What do I need to join?",
    a: "A laptop or phone with internet and 60 minutes. A laptop is easier for building.",
  },
  {
    q: "Do I need to know AI or coding first?",
    a: "No prior AI knowledge is needed. The session is built around making a first small project.",
  },
  {
    q: "What is the seat code on my ticket?",
    a: "It is your unique ticket ID and also your referral code. Friends who register through your link are counted against it.",
  },
  {
    q: "How do referrals work?",
    a: "Share your link from the ticket page. When a friend registers through it, they count for your seat code and for your college's bar on the board.",
  },
  {
    q: "What does the college board show?",
    a: "How many students from each college have registered, out of a goal of 25. When a college reaches 25, it shows an unlocked state for a free project template pack. This is a prototype, so pack delivery is not built yet.",
  },
  {
    q: 'What does "Demo data" mean?',
    a: "Some rows on the board and admin pages are sample data added so the app can be demonstrated. They are labelled and are not real students.",
  },
  {
    q: "What happens to the details I enter?",
    a: "Your name, email, college, branch, year and interest are saved to issue your ticket and count registrations. They are not shown publicly. Only your first name and college can appear on a shared ticket page.",
  },
  {
    q: "Will I get a confirmation email?",
    a: "No. This prototype does not send emails. Keep your ticket link or save your ticket image.",
  },
  {
    q: "Is this an official page?",
    a: "No. This is a concept prototype built for a growth challenge, with no company affiliation.",
  },
  {
    q: "Something is not working. What should I do?",
    a: "Reload the page and try again. If the ticket link still fails, register again with the same email to see the existing ticket.",
  },
];
