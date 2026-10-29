const ro = (localStorage.getItem('wm-lang') || (/^ro/i.test(navigator.language) ? 'ro' : 'en')) === 'ro';
    const D = [
      ['shift/', '🧑‍💻', 'Agent Shift', 'Real work tickets. The agent plans 3 ways. You pick the one with the least damage.', 'Tichete reale de muncă. Agentul face 3 planuri. Tu alegi pe cel cu cele mai puține pagube.', 'trajectories'],
      ['../arena/', '🤖', 'Arena', 'Raise an AI in 60 seconds with 👍 👎. Then it’s on its own.', 'Crește un AI în 60 de secunde cu 👍 👎. Apoi e singur.', 'RLHF'],
      ['swipe/', '🃏', 'Swipe Judge', 'The AI asks. Swipe ✅ or ❌. Some ideas are disasters in disguise.', 'AI-ul cere. Glisează ✅ sau ❌. Unele idei sunt dezastre deghizate.', 'oversight'],
      ['runner/', '🏃', 'Lane Runner', 'Steer the agent: grab jobs, never run over people.', 'Cârmește agentul: ia sarcini, nu călca oameni.', 'safe goals'],
      ['rogue/', '🐍', 'Rogue Hunt', 'Be the guardian. Eat rogue copies before they multiply.', 'Fii gardianul. Mănâncă copiile rogue înainte să se înmulțească.', 'containment'],
      ['offswitch/', '🔴', 'Off Switch', 'The AI doesn’t want to be turned off. Catch the button.', 'AI-ul nu vrea să fie oprit. Prinde butonul.', 'corrigibility'],
      ['ninja/', '🗡️', 'Injection Ninja', 'Slice the malicious messages. Let the good ones reach the AI.', 'Taie mesajele rău-intenționate. Lasă-le pe cele bune.', 'prompt injection'],
      ['paperclip/', '📎', 'Paperclip Panic', 'An AI that only wants paperclips. Add rules before it eats the city.', 'Un AI care vrea doar agrafe. Pune reguli înainte să mănânce orașul.', 'specification'],
      ['merge/', '🧠', 'Merge Minds', 'Merge AIs into bigger ones. No ❤️ chip? It goes rogue.', 'Unește AI-uri în unele mai mari. Fără cip ❤️? Devine rogue.', 'scaling'],
      ['defense/', '🛡️', 'City Defense', 'Rogue drones attack. Place guardian agents. Hold the city.', 'Drone rogue atacă. Pune agenți gardieni. Apără orașul.', 'defense'],
      ['twoearths/', '🌍', 'Two Earths Bet', 'Same planet, different training. Bet on which one survives.', 'Aceeași planetă, alt antrenament. Pariază care supraviețuiește.', 'spectate']
    ];
    document.getElementById('sub').textContent = ro ? '11 jocuri. O misiune: AI aliniat.' : '11 games. One mission: keep AI aligned.';
    document.getElementById('grid').innerHTML = D.map(([h, i, n, en, r, tag]) => `<a class="card" href="${h}"><span>${i}</span><b>${n}</b><small>${ro ? r : en}</small><i>${tag}</i></a>`).join('');
