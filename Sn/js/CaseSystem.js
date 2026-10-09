// CaseSystem.js - In-Game Economy, Crate Shop, Roulette Wheel & Skin Management
export class CaseSystem {
  constructor(audioSystem, weaponSystem) {
    this.audio = audioSystem;
    this.weaponSystem = weaponSystem;

    // Currency & Inventory state
    this.coins = 350;
    this.inventory = ['sniper_classic', 'knife_vanilla'];
    this.equippedSniper = 'sniper_classic';
    this.equippedKnife = 'knife_vanilla';

    this.isUnboxing = false;

    // Skins Database
    this.skins = {
      // Common (Tier 1)
      sniper_classic: {
        id: 'sniper_classic',
        name: 'Classic Blockout',
        type: 'SNIPER',
        rarity: 'common',
        color: '#95a5a6',
        primaryColor: 0x242830,
        accentColor: 0x00c3ff
      },
      knife_vanilla: {
        id: 'knife_vanilla',
        name: 'Standard Issue Knife',
        type: 'KNIFE',
        rarity: 'common',
        color: '#95a5a6',
        bladeColor: 0xd8d8d8,
        handleColor: 0x222428
      },
      // Uncommon (Tier 2)
      sniper_desert: {
        id: 'sniper_desert',
        name: 'Desert Stud',
        type: 'SNIPER',
        rarity: 'uncommon',
        color: '#2ecc71',
        primaryColor: 0x8c7853,
        accentColor: 0x4a3f2c
      },
      sniper_arctic: {
        id: 'sniper_arctic',
        name: 'Arctic Frost',
        type: 'SNIPER',
        rarity: 'uncommon',
        color: '#2ecc71',
        primaryColor: 0xced6e0,
        accentColor: 0x747d8c
      },
      knife_olive: {
        id: 'knife_olive',
        name: 'Tactical Olive Tanto',
        type: 'KNIFE',
        rarity: 'uncommon',
        color: '#2ecc71',
        bladeColor: 0x4b5320,
        handleColor: 0x1a1c14
      },
      // Rare (Tier 3)
      sniper_neon: {
        id: 'sniper_neon',
        name: 'Cyberpunk Neon',
        type: 'SNIPER',
        rarity: 'rare',
        color: '#3498db',
        primaryColor: 0x1e272e,
        accentColor: 0x00f7ff,
        emissive: true
      },
      sniper_orange: {
        id: 'sniper_orange',
        name: 'Orange Blockout',
        type: 'SNIPER',
        rarity: 'rare',
        color: '#3498db',
        primaryColor: 0x2f3542,
        accentColor: 0xff6600,
        emissive: true
      },
      knife_cobalt: {
        id: 'knife_cobalt',
        name: 'Cobalt Dagger',
        type: 'KNIFE',
        rarity: 'rare',
        color: '#3498db',
        bladeColor: 0x0088ff,
        handleColor: 0x111e2e
      },
      // Epic (Tier 4)
      sniper_asiimov: {
        id: 'sniper_asiimov',
        name: 'Asiimov Mecha',
        type: 'SNIPER',
        rarity: 'epic',
        color: '#9b59b6',
        primaryColor: 0xecf0f1,
        accentColor: 0xff5500,
        metalColor: 0x222222,
        roughness: 0.25
      },
      sniper_void: {
        id: 'sniper_void',
        name: 'Hyper Void',
        type: 'SNIPER',
        rarity: 'epic',
        color: '#9b59b6',
        primaryColor: 0x2c003e,
        accentColor: 0xff007f,
        emissive: true
      },
      knife_crimson: {
        id: 'knife_crimson',
        name: 'Crimson Web',
        type: 'KNIFE',
        rarity: 'epic',
        color: '#9b59b6',
        bladeColor: 0xd63031,
        handleColor: 0x111111
      },
      // Legendary (Tier 5)
      sniper_dragon: {
        id: 'sniper_dragon',
        name: 'Dragon Lore Gold',
        type: 'SNIPER',
        rarity: 'legendary',
        color: '#f1c40f',
        primaryColor: 0xffcc00,
        accentColor: 0x33ff66,
        metalness: 0.85,
        roughness: 0.15,
        emissive: true
      },
      knife_fade: {
        id: 'knife_fade',
        name: 'Fade Marble Karambit',
        type: 'KNIFE',
        rarity: 'legendary',
        color: '#f1c40f',
        bladeColor: 0x9b59b6,
        handleColor: 0x222222
      }
    };

    // Cases definition
    this.cases = [
      {
        id: 'case_blockout',
        name: 'Blockout Crate',
        cost: 100,
        pool: ['sniper_desert', 'sniper_arctic', 'knife_olive', 'sniper_orange', 'sniper_asiimov']
      },
      {
        id: 'case_cyber',
        name: 'Cyber Strike Case',
        cost: 250,
        pool: ['sniper_neon', 'sniper_orange', 'knife_cobalt', 'sniper_void', 'knife_crimson']
      },
      {
        id: 'case_lockedin',
        name: 'Locked In Special Case',
        cost: 500,
        pool: ['sniper_neon', 'sniper_void', 'knife_crimson', 'sniper_dragon', 'knife_fade']
      }
    ];

    this.initUI();
  }

  addCoins(amount) {
    this.coins += amount;
    this.updateHUDCoins();
  }

  updateHUDCoins() {
    const el = document.getElementById('coin-display');
    if (el) el.textContent = `${this.coins} 🪙`;
    const shopCoins = document.getElementById('shop-coins-counter');
    if (shopCoins) shopCoins.textContent = this.coins;
  }

  initUI() {
    this.updateHUDCoins();
  }

  openShopModal() {
    const modal = document.getElementById('shop-modal');
    if (modal) {
      modal.style.display = 'flex';
      this.renderShopCases();
      this.renderInventory();
    }
  }

  closeShopModal() {
    const modal = document.getElementById('shop-modal');
    if (modal) modal.style.display = 'none';
  }

  renderShopCases() {
    const container = document.getElementById('case-list-container');
    if (!container) return;
    container.innerHTML = '';

    this.cases.forEach(c => {
      const card = document.createElement('div');
      card.className = 'case-card';
      card.innerHTML = `
        <div class="case-card-title">${c.name}</div>
        <div class="case-card-icon">📦</div>
        <div class="case-card-cost">${c.cost} 🪙</div>
        <button class="case-open-btn" ${this.coins < c.cost || this.isUnboxing ? 'disabled' : ''}>
          ${this.coins < c.cost ? 'NOT ENOUGH COINS' : 'UNBOX CASE'}
        </button>
      `;

      const btn = card.querySelector('.case-open-btn');
      const handleOpen = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.startUnbox(c);
      };
      btn.addEventListener('click', handleOpen);
      btn.addEventListener('touchend', handleOpen, { passive: false });

      container.appendChild(card);
    });
  }

  renderInventory() {
    const invContainer = document.getElementById('inventory-list-container');
    if (!invContainer) return;
    invContainer.innerHTML = '';

    this.inventory.forEach(skinId => {
      const skin = this.skins[skinId];
      if (!skin) return;

      const isEquipped = (skin.type === 'SNIPER' && this.equippedSniper === skinId) ||
                         (skin.type === 'KNIFE' && this.equippedKnife === skinId);

      const item = document.createElement('div');
      item.className = `inventory-item rarity-${skin.rarity}`;
      item.innerHTML = `
        <div class="inv-name" style="color: ${skin.color};">${skin.name}</div>
        <div class="inv-type">${skin.type} (${skin.rarity.toUpperCase()})</div>
        <button class="inv-equip-btn ${isEquipped ? 'equipped' : ''}">
          ${isEquipped ? 'EQUIPPED' : 'EQUIP'}
        </button>
      `;

      const btn = item.querySelector('.inv-equip-btn');
      const handleEquip = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.equipSkin(skinId);
        this.renderInventory();
      };
      btn.addEventListener('click', handleEquip);
      btn.addEventListener('touchend', handleEquip, { passive: false });

      invContainer.appendChild(item);
    });
  }

  equipSkin(skinId) {
    const skin = this.skins[skinId];
    if (!skin) return;

    if (skin.type === 'SNIPER') {
      this.equippedSniper = skinId;
      this.weaponSystem.applySniperSkin(skin);
    } else {
      this.equippedKnife = skinId;
      this.weaponSystem.applyKnifeSkin(skin);
    }
  }

  // Horizontal CS:GO / Roblox unboxing carousel animation
  startUnbox(caseItem) {
    if (this.coins < caseItem.cost || this.isUnboxing) return;

    this.isUnboxing = true;
    this.addCoins(-caseItem.cost);
    this.renderShopCases();

    const rouletteOverlay = document.getElementById('roulette-overlay');
    const strip = document.getElementById('roulette-strip');
    const rewardModal = document.getElementById('reward-modal');

    rouletteOverlay.style.display = 'flex';
    strip.innerHTML = '';
    strip.style.transform = 'translateX(0px)';

    // Pick winning item based on rarity weights
    const winningSkinId = this.pickRandomSkinFromPool(caseItem.pool);
    const winningSkin = this.skins[winningSkinId];

    // Generate 60 cards for the spinning roulette strip
    const totalCards = 60;
    const winnerIndex = 48; // Stops near the end
    const cardWidth = 140;

    for (let i = 0; i < totalCards; i++) {
      const sId = (i === winnerIndex) ? winningSkinId : caseItem.pool[Math.floor(Math.random() * caseItem.pool.length)];
      const skin = this.skins[sId];

      const card = document.createElement('div');
      card.className = `roulette-card rarity-${skin.rarity}`;
      card.innerHTML = `
        <div class="card-bar" style="background: ${skin.color}"></div>
        <div class="card-icon">${skin.type === 'SNIPER' ? '🎯' : '🗡️'}</div>
        <div class="card-title" style="color: ${skin.color};">${skin.name}</div>
        <div class="card-rarity">${skin.rarity.toUpperCase()}</div>
      `;
      strip.appendChild(card);
    }

    // Play ticking audio as it rolls
    let tickCount = 0;
    const tickInterval = setInterval(() => {
      this.audio.playCrateTick();
      tickCount++;
      if (tickCount > 35) clearInterval(tickInterval);
    }, 110);

    // Calculate exact stopping pixel position so the winner card lands in the center needle
    const centerOffset = rouletteOverlay.clientWidth / 2;
    const targetOffset = -(winnerIndex * cardWidth + cardWidth / 2 - centerOffset) + (Math.random() * 60 - 30);

    setTimeout(() => {
      strip.style.transition = 'transform 4.5s cubic-bezier(0.12, 0.8, 0.25, 1)';
      strip.style.transform = `translateX(${targetOffset}px)`;
    }, 50);

    // On finish rolling
    setTimeout(() => {
      this.isUnboxing = false;
      this.inventory.push(winningSkinId);

      this.audio.playUnlockFanfare(winningSkin.rarity);

      // Display Reward Modal
      rewardModal.style.display = 'flex';
      const rewardContent = document.getElementById('reward-content');
      rewardContent.innerHTML = `
        <div class="reward-glow" style="box-shadow: 0 0 60px ${winningSkin.color};"></div>
        <h2 style="color: ${winningSkin.color};">UNLOCKED: ${winningSkin.name}!</h2>
        <p>Rarity: <strong style="color: ${winningSkin.color}; text-transform: uppercase;">${winningSkin.rarity}</strong></p>
        <button id="reward-equip-btn" class="case-open-btn">EQUIP NOW</button>
        <button id="reward-close-btn" class="case-open-btn" style="background: #444;">CLOSE</button>
      `;

      const equipBtn = document.getElementById('reward-equip-btn');
      const closeBtn = document.getElementById('reward-close-btn');

      const handleRewardEquip = (e) => {
        if (e) { e.stopPropagation(); if (e.preventDefault) e.preventDefault(); }
        this.equipSkin(winningSkinId);
        rewardModal.style.display = 'none';
        rouletteOverlay.style.display = 'none';
        this.renderInventory();
        this.renderShopCases();
      };

      const handleRewardClose = (e) => {
        if (e) { e.stopPropagation(); if (e.preventDefault) e.preventDefault(); }
        rewardModal.style.display = 'none';
        rouletteOverlay.style.display = 'none';
        this.renderShopCases();
      };

      if (equipBtn) {
        equipBtn.onclick = handleRewardEquip;
        equipBtn.addEventListener('touchend', handleRewardEquip, { passive: false });
      }
      if (closeBtn) {
        closeBtn.onclick = handleRewardClose;
        closeBtn.addEventListener('touchend', handleRewardClose, { passive: false });
      }
    }, 4800);
  }

  pickRandomSkinFromPool(pool) {
    const rand = Math.random();
    // Probabilities: Common: 45%, Uncommon: 30%, Rare: 15%, Epic: 7%, Legendary: 3%
    const weights = {
      common: 0.45,
      uncommon: 0.30,
      rare: 0.15,
      epic: 0.07,
      legendary: 0.03
    };

    // Filter items in pool by rarity
    const skinsByRarity = { common: [], uncommon: [], rare: [], epic: [], legendary: [] };
    pool.forEach(id => {
      const s = this.skins[id];
      if (s && skinsByRarity[s.rarity]) skinsByRarity[s.rarity].push(id);
    });

    let cumulative = 0;
    const sortedRarities = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    for (const r of sortedRarities) {
      cumulative += weights[r];
      if (rand <= cumulative && skinsByRarity[r].length > 0) {
        return skinsByRarity[r][Math.floor(Math.random() * skinsByRarity[r].length)];
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }
}
