import { Link } from "react-router";
import type { Route } from "./+types/faq";

const FAQ = [
  {
    q: "What should I wear?",
    a: "Wear what you feel comfortable running in.",
  },
  {
    q: "Do I need boots and shin pads?",
    a: "No, both are not required. Though both are recommended. Boots are useful for wet weather as we play on grass. As we have different levels of ability, it's recommended to wear shin pads for everyone's safety.",
  },
  {
    q: "I have not played before or for a long time, is that a problem?",
    a: "Not a problem - we accept all varieties of skill levels. We will try to balance teams to the best of our ability.",
  },
  {
    q: "How long do we play for?",
    a: "We play three (3) thirty minute (30) halves with around a five (5) minute break in between each. Each session runs approximately from 10:30am to 12:30pm.",
  },
  {
    q: "Can I play only one or two halves?",
    a: "Yes, not a problem. We will accommodate for those who do not feel like they can play the entire ninety (90) minute playtime.",
  },
  {
    q: "Can I only play in goal?",
    a: "Yes, we try to change the keeper approximately every five (5) minutes. But if you want to play longer, or the entire session in goal that is not a problem.",
  },
  {
    q: "What's the minimum number of players?",
    a: "We require a minimum of 10 players. We currently have enough members that it is extremely rare for sessions to be cancelled due to lack of players.",
  },
  {
    q: "Where do you play?",
    a: "We play at Wavertree Botanic Gardens, it's hard to miss us!",
  },
  {
    q: "Can I watch a session first?",
    a: "Yes, we will always encourage people to try a session. If you feel more comfortable watching for a session before joining then that is also fine!",
  },
  {
    q: "Do you charge a fee?",
    a: "No, we do not charge a fee. We are entirely funded by donations from regular players. We are currently raising donations, and you can donate via bank transfer 🙏",
  },
  {
    q: "Are you looking for more organisers?",
    a: "Always! Please reach out to one of the organisers. We are looking for people who embrace and demonstrate the Terrible Football values. Attend at least semi regularly and can help out with equipment and setting up pitches before the game.",
  },
  {
    q: "It's raining - will the session be cancelled?",
    a: "Unlikely! We will still play in the rain - unless it's so bad it prohibits play. Keep an active eye on meet-up and the WhatsApp group in case that changes last minute.",
  },
  {
    q: "If I'm late, can I still play?",
    a: "Yes! There's a small chance that you may have to wait until the next game - but we will try to get everyone into play when they arrive.",
  },
  {
    q: "Is it men only?",
    a: "No! We accept all genders.",
  },
  {
    q: "I'm under 18, can I still play?",
    a: "Yes, but you will need to have a guardian or parent present to play.",
  },
  {
    q: "There is more than 22 players signed up, what happens now?",
    a: "We increase the number of pitches. We aim for seven (7) to eight (8) a side, with two (2) pitches - four (4) teams in total which play each other.",
  },
];

export function meta({}: Route.MetaArgs) {
  return [{ title: "FAQ – Terrible Football Liverpool" }];
}

export default function Faq() {
  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <Link
          to="/"
          className="text-[15px] text-[#0A84FF] hover:opacity-80 mb-6 inline-block"
        >
          ← Back to sessions
        </Link>
        <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-8">
          Frequently asked questions
        </h1>
        <dl className="space-y-0">
          {FAQ.map((item, i) => (
            <div
              key={i}
              className="border-b border-neutral-200/80 dark:border-neutral-700/60 py-5 first:pt-0 last:border-0"
            >
              <dt className="text-[17px] font-semibold text-neutral-900 dark:text-white mb-1.5">
                {item.q}
              </dt>
              <dd className="text-[15px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
