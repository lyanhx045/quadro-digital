// Liquid simulation adapted from the user-provided quadrado.html.
function prepararGotasChocolate(host) {
 requestAnimationFrame(() => {
  if (!host.isConnected) return;
  const card = host.closest('.card-atividade');
  const id = 'ch-liquido-' + (prepararGotasChocolate.sequencia = (prepararGotasChocolate.sequencia || 0) + 1);
  host.innerHTML = `<svg class="ch-liquido-svg" aria-hidden="true"><defs>
   <filter id="${id}" filterUnits="userSpaceOnUse" x="-40" y="-40" color-interpolation-filters="sRGB">
    <feGaussianBlur stdDeviation="1.6"/>
    <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 12 -6"/>
    <feGaussianBlur class="ch-edge-smoothing" stdDeviation="0.3"/>
   </filter></defs>
   <g class="ch-liquido" filter="url(#${id})"><rect class="ch-liquido-base"/></g>
   <g class="ch-respingos"/></svg>`;
  function updateBox() {
   const width = card.clientWidth, height = card.clientHeight;
   if (width !== BOX.right) {
    const ratio = width / BOX.right;
    for (const d of drops) {
     if (d.surface === 'free') continue;
     d.x *= ratio;
     if (d.surface === 'top' || d.surface === 'bottom') d.anchor *= ratio;
    }
   }
   BOX.right = width; BOX.bottom = height;
   const rect = host.querySelector('.ch-liquido-base');
   rect.setAttribute('width', width); rect.setAttribute('height', height);
   BOX.corner = Math.min(parseFloat(getComputedStyle(card).borderRadius) || 0, width / 2, height / 2);
   rect.setAttribute('rx', BOX.corner);
   host.querySelector('filter').setAttribute('width', width + 80);
  }

    'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
    const BOX = { left: 0, right: card.clientWidth, top: 0, bottom: card.clientHeight, corner: 0 };
    const PHYSICS = { dt: 1 / 120, gravity: 520, releaseTime: 1.1, maxDrops: 6 };
    const radiusBlend = 1 - Math.exp(-PHYSICS.dt * 14);
    const velocityBlend = 1 - Math.exp(-PHYSICS.dt * 3);
    const liquid = host.querySelector('.ch-liquido');
    const svg = liquid.ownerSVGElement;
    const activityList = card.closest('#lista-atividades-proximas, #lista-atividades-dia');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const drops = [];
    const splashes = [];
    const splashLayer = host.querySelector('.ch-respingos');
    // Contêiner externo selecionado no SVG: aqui é o retângulo azul.
    const container = document.documentElement;
    const pointer = { active: false, x: 0, y: 0 };
    let collisionWorld = { inverse: null, floor: Infinity, boundary: null, targets: [], pointerRadius: 6 };
    const random = (min, max) => min + Math.random() * (max - min);
    const clamp = value => Math.max(0, Math.min(1, value));
    let nextBirth = 0;
    let previous = null;
    let accumulator = 0;
    let frameId = null;

    function ellipse(element, x, y, rx, ry) {
      element.setAttribute('cx', x);
      element.setAttribute('cy', y);
      element.setAttribute('rx', rx);
      element.setAttribute('ry', ry);
    }

    function createDrop(surface, position, mass = 0.04) {
      const horizontal = surface === 'top' || surface === 'bottom';
      position = Math.max(BOX.corner, Math.min((horizontal ? BOX.right : BOX.bottom) - BOX.corner, position));
      const group = document.createElementNS(SVG_NS, 'g');
      const neck = document.createElementNS(SVG_NS, 'ellipse');
      const bead = document.createElementNS(SVG_NS, 'ellipse');
      group.append(neck, bead);
      liquid.appendChild(group);
      const targetRadius = Math.random() < 0.35 ? random(5.5, 8) : random(2.5, 4.8);
      const limit = targetRadius * targetRadius;
      const drop = {
        group, neck, bead, surface, mass, limit,
        radius: Math.sqrt(mass), growth: limit / random(7, 11),
        x: surface === 'top' || surface === 'bottom' ? position : surface === 'left' ? BOX.left : BOX.right,
        y: surface === 'top' ? BOX.top : surface === 'bottom' ? BOX.bottom : position,
        flowSide: position < (BOX.left + BOX.right) / 2 ? -1 : 1,
        vx: 0, vy: 0, stretch: 0, released: 0, anchor: position,
        neckVisible: null, mouseArmed: false, cornerAngle: 0, cornerSpeed: 0
      };
      drops.push(drop);
      return drop;
    }

    function removeDrop(index) {
      drops[index].group.remove();
      drops.splice(index, 1);
    }

    function combine(a, b) {
      const mass = a.mass + b.mass;
      const weight = b.mass / mass;
      a.x += (b.x - a.x) * weight;
      a.y += (b.y - a.y) * weight;
      a.vx += (b.vx - a.vx) * weight;
      a.vy += (b.vy - a.vy) * weight;
      a.anchor += (b.anchor - a.anchor) * weight;
      a.mass = mass; // Mass is proportional to the liquid's 2D area.
      a.growth = Math.min(8, a.growth + b.growth * 0.15);
    }

    function updateDrop(d, dt) {
      if (d.surface !== 'free' && (d.surface === 'bottom' || d.mass < d.limit * 1.15)) d.mass += d.growth * dt;
      d.radius += (Math.sqrt(d.mass) - d.radius) * radiusBlend;

      if (d.surface === 'top') {
        d.y = BOX.top + d.radius * 0.55;
        const speed = Math.max(0, d.mass / d.limit - 0.1) * 24;
        d.vx += (d.flowSide * speed - d.vx) * velocityBlend;
        d.x += d.vx * dt;
        const edge = d.flowSide < 0 ? BOX.left : BOX.right;
        const turnX = edge - d.flowSide * BOX.corner;
        if (d.flowSide * (d.x - turnX) >= 0) {
          d.x = turnX;
          d.surface = d.flowSide < 0 ? 'top-left' : 'top-right';
          d.cornerAngle = 0;
          d.cornerSpeed = Math.abs(d.vx);
          d.vx = 0;
          d.vy = 0;
        }
      } else if (d.surface.startsWith('top-') || d.surface.startsWith('bottom-')) {
        const upper = d.surface.startsWith('top-');
        const side = d.surface.endsWith('left') ? -1 : 1;
        const speed = Math.max(0, d.mass / d.limit - 0.12) * 32;
        d.cornerSpeed += (speed - d.cornerSpeed) * velocityBlend;
        const progress = d.cornerAngle / (Math.PI / 2);
        const inset = d.radius * (upper ? 0.55 : 0.55 - 0.1 * progress);
        const radius = Math.max(0.5, BOX.corner - inset);
        d.cornerAngle = Math.min(Math.PI / 2, d.cornerAngle + d.cornerSpeed * dt / radius);
        const cx = (side < 0 ? BOX.left : BOX.right) - side * BOX.corner;
        const cy = upper ? BOX.top + BOX.corner : BOX.bottom - BOX.corner;
        const finalInset = d.radius * (upper ? 0.55 : 0.55 - 0.1 * d.cornerAngle / (Math.PI / 2));
        const arcRadius = Math.max(0.5, BOX.corner - finalInset);
        d.x = cx + side * arcRadius * (upper ? Math.sin(d.cornerAngle) : Math.cos(d.cornerAngle));
        d.y = cy + arcRadius * (upper ? -Math.cos(d.cornerAngle) : Math.sin(d.cornerAngle));
        if (d.cornerAngle === Math.PI / 2) {
          d.surface = upper ? (side < 0 ? 'left' : 'right') : 'bottom';
          d.anchor = d.x;
          d.vy = upper ? d.cornerSpeed : 0;
        }
      } else if (d.surface === 'left' || d.surface === 'right') {
        const side = d.surface === 'left' ? -1 : 1;
        d.x = (side < 0 ? BOX.left : BOX.right) - side * d.radius * 0.55;
        const speed = Math.max(0, d.mass / d.limit - 0.12) * 32;
        d.vy += (speed - d.vy) * velocityBlend;
        d.y += d.vy * dt;
        // Keep the liquid's position continuous as it passes the corner.
        if (d.y >= BOX.bottom - BOX.corner) {
          d.y = BOX.bottom - BOX.corner;
          d.surface = side < 0 ? 'bottom-left' : 'bottom-right';
          d.cornerAngle = 0;
          d.cornerSpeed = d.vy;
          d.vy = 0;
        }
      } else if (d.surface === 'bottom') {
        if (d.mass > d.limit) d.stretch = Math.min(1, d.stretch + dt / PHYSICS.releaseTime);
        d.x = d.anchor;
        d.y = BOX.bottom + d.radius * (-0.45 + d.stretch * 2.45);
        if (d.stretch === 1) {
          d.surface = 'free';
          d.vy = d.radius * 2.45 / PHYSICS.releaseTime;
          d.vx = 0;
        }
      } else {
        d.released += dt;
        d.y += d.vy * dt + 0.5 * PHYSICS.gravity * dt * dt;
        d.vy += PHYSICS.gravity * dt;
        d.x += d.vx * dt;
      }
    }

    function refreshCollisions() {
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const inverse = matrix.inverse();
      const scale = Math.hypot(matrix.a, matrix.b);
      const toWorld = (x, y) => new DOMPoint(x, y).matrixTransform(inverse);
      const containerBounds = {left:0, top:0, right:innerWidth, bottom:innerHeight};
      // Nas listas, o limite é a janela visível, não a altura total do scroll.
      if (activityList) {
        for (let element = activityList; element; element = element.parentElement) {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          if (element === activityList || /auto|scroll|hidden|clip/.test(style.overflowX)) {
            containerBounds.left = Math.max(containerBounds.left,bounds.left);
            containerBounds.right = Math.min(containerBounds.right,bounds.right);
          }
          if (element === activityList || /auto|scroll|hidden|clip/.test(style.overflowY)) {
            containerBounds.top = Math.max(containerBounds.top,bounds.top);
            containerBounds.bottom = Math.min(containerBounds.bottom,bounds.bottom);
          }
        }
      }
      const bottom = containerBounds.bottom;
      const startCorner = toWorld(containerBounds.left, containerBounds.top);
      const endCorner = toWorld(containerBounds.right, bottom);
      const boundary = {left:startCorner.x, top:startCorner.y, right:endCorner.x, bottom:endCorner.y};
      const targets = [];
      let candidates;
      if (activityList) {
        const cards = [...activityList.querySelectorAll('.card-atividade')].filter(element => element.getClientRects().length && getComputedStyle(element).display !== 'none');
        // A → atravessa B → toca C. Os elementos internos de B não colidem.
        const target = cards[cards.indexOf(card) + 2];
        candidates = target ? [target] : [];
      } else candidates = document.querySelectorAll('div');
      for (const element of candidates) {
        if (element === container || element.contains(svg) || card.contains(element)) continue;
        const bounds = element.getBoundingClientRect();
        if (!bounds.width || !bounds.height || bounds.bottom <= 0 || bounds.top >= bottom) continue;
        const style = getComputedStyle(element);
        if (style.visibility !== 'visible' || Number(style.opacity) === 0) continue;
        const start = toWorld(bounds.left, bounds.top);
        const end = toWorld(bounds.right, bounds.bottom);
        if (end.y <= BOX.bottom) continue;
        targets.push({left:start.x, top:start.y, right:end.x, bottom:end.y});
      }
      const floor = toWorld(0, bottom).y;
      if (floor !== collisionWorld.floor) {
        host.querySelector('filter').setAttribute('height', Math.max(BOX.bottom + 80, floor + 80));
      }
      collisionWorld = {inverse, floor, boundary, targets, pointerRadius:6 / scale};
    }

    // Swept tests catch thin surfaces even between two simulation steps.
    function segmentCircle(x, y, endX, endY, cx, cy, radius) {
      const dx = endX - x, dy = endY - y;
      const ox = x - cx, oy = y - cy;
      const c = ox * ox + oy * oy - radius * radius;
      if (c <= 0) return 0;
      const a = dx * dx + dy * dy;
      if (!a) return null;
      const b = 2 * (ox * dx + oy * dy);
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) return null;
      const time = (-b - Math.sqrt(discriminant)) / (2 * a);
      return time >= 0 && time <= 1 ? time : null;
    }

    function surfaceHit(x, y, d, bounds) {
      let enter = 0, leave = 1, nx = 0, ny = -1;
      const axes = [[x, d.x-x, bounds.left-d.radius, bounds.right+d.radius, 1, 0],
        [y, d.y-y, bounds.top-d.radius, bounds.bottom+d.radius, 0, 1]];
      for (const [origin, delta, min, max, ax, ay] of axes) {
        if (Math.abs(delta) < 1e-9) {
          if (origin < min || origin > max) return null;
          continue;
        }
        const a = (min-origin)/delta, b = (max-origin)/delta;
        const near = Math.min(a,b), far = Math.max(a,b);
        if (near > enter) { enter = near; nx = -Math.sign(delta)*ax; ny = -Math.sign(delta)*ay; }
        leave = Math.min(leave,far);
        if (enter > leave) return null;
      }
      return enter <= 1 && leave >= 0 ? {time:enter,nx,ny} : null;
    }

    function containerExit(d, x, y) {
      const b = collisionWorld.boundary;
      let hit = null;
      // Estoura só após o CENTRO sair do contêiner externo.
      // Não antecipa o impacto pelo raio da gota e não usa o quadrado vermelho.
      function crossing(start, end, edge, outside, nx, ny) {
        if (!outside) return;
        const time = end === start ? 0 : clamp((edge - start) / (end - start));
        if (!hit || time < hit.time) hit = {time, nx, ny};
      }
      crossing(x, d.x, b.left, d.x < b.left, 1, 0);
      crossing(x, d.x, b.right, d.x > b.right, -1, 0);
      crossing(y, d.y, b.top, d.y < b.top, 0, 1);
      crossing(y, d.y, b.bottom, d.y > b.bottom, 0, -1);
      return hit;
    }

    function findImpact(d, x, y) {
      // Gotas ainda presas, ou no exato passo de desprendimento, não estouram.
      // Somente gotas já em queda livre podem sofrer os impactos abaixo.
      if (d.surface !== 'free' || d.released === 0) return null;
      let hit = null;
      const choose = candidate => {
        if (candidate && (!hit || candidate.time < hit.time)) hit = candidate;
      };
      if (pointer.active && !activityList) {
        const p = new DOMPoint(pointer.x,pointer.y).matrixTransform(collisionWorld.inverse);
        const insideSquare = p.x >= BOX.left && p.x <= BOX.right && p.y >= BOX.top && p.y <= BOX.bottom;
        const reach = d.radius + collisionWorld.pointerRadius;
        if (!d.mouseArmed) {
          // Evita o estouro imediato ao nascer sobre um cursor parado.
          // Habilita a colisão depois que a gota se afasta do cursor.
          const dx = d.x - p.x, dy = d.y - p.y;
          d.mouseArmed = insideSquare || dx * dx + dy * dy > reach * reach;
        } else if (!insideSquare) {
          const time = segmentCircle(x,y,d.x,d.y,p.x,p.y,reach);
          if (time !== null) choose({time,nx:0,ny:0});
        }
      } else {
        d.mouseArmed = true;
      }
      choose(containerExit(d,x,y));
      for (const bounds of collisionWorld.targets) choose(surfaceHit(x,y,d,bounds));
      if (hit) { hit.x = x+(d.x-x)*hit.time; hit.y = y+(d.y-y)*hit.time; }
      return hit;
    }

    // Animação do impacto: cria de 6 a 12 respingos; mantém no máximo 120.
    // A remoção da gota original ocorre em step(), logo após esta chamada.
    function explode(d, hit) {
      const count = Math.min(12, Math.max(6, Math.round(d.radius * 1.5)));
      for (let i=0; i<count; i++) {
        if (splashes.length >= 120) {
          splashes[0].element.remove();
          splashes.shift();
        }
        const element = document.createElementNS(SVG_NS,'circle');
        splashLayer.appendChild(element);
        const direction = hit.nx || hit.ny
          ? Math.atan2(hit.ny,hit.nx) + random(-1.25,1.25)
          : i/count*Math.PI*2 + random(-0.2,0.2);
        const speed = random(55,140) + d.radius*5;
        splashes.push({element,x:hit.x,y:hit.y,
          vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed,
          radius:random(0.8,1.8)*Math.sqrt(d.radius/4),age:0,life:random(0.32,0.65)});
      }
    }

    function updateSplashes(dt) {
      for (let i=splashes.length-1;i>=0;i--) {
        const p = splashes[i];
        p.age += dt;
        if (p.age >= p.life) { p.element.remove(); splashes.splice(i,1); continue; }
        p.x += p.vx*dt;
        p.y += p.vy*dt + 0.5*PHYSICS.gravity*dt*dt;
        p.vy += PHYSICS.gravity*dt;
      }
    }

    function step(dt) {
      nextBirth -= dt;
      if (nextBirth <= 0 && drops.length < PHYSICS.maxDrops) {
        const choice = Math.random();
        const surface = choice < 0.4 ? 'top' : choice < 0.7 ? 'bottom' : Math.random() < 0.5 ? 'left' : 'right';
        createDrop(surface, surface === 'top' || surface === 'bottom' ? random(BOX.left + 16, BOX.right - 16) : random(BOX.top + 18, BOX.bottom - 18));
        nextBirth = random(2.4, 4.2);
      }
      updateSplashes(dt);
      for (let i=drops.length-1;i>=0;i--) {
        const d = drops[i], x = d.x, y = d.y;
        updateDrop(d,dt);
        const hit = collisionWorld.inverse ? findImpact(d,x,y) : null;
        // Um impacto gera uma única explosão e encerra a gota original.
        if (hit) { explode(d,hit); removeDrop(i); }
      }

      for (let i = 0; i < drops.length; i++) {
        const a = drops[i];
        for (let j = i + 1; j < drops.length; j++) {
          const b = drops[j];
          if (a.surface !== b.surface) continue;
          const dx = a.x - b.x, dy = a.y - b.y;
          const reach = a.radius + b.radius;
          if (dx * dx + dy * dy <= reach * reach) {
            combine(a, b);
            removeDrop(j--);
          }
        }
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        if (drops[i].y - drops[i].radius > collisionWorld.floor + 40) removeDrop(i);
      }
    }

    function draw() {
      for (const p of splashes) {
        p.element.setAttribute('cx',p.x);
        p.element.setAttribute('cy',p.y);
        p.element.setAttribute('r',p.radius*Math.sqrt(Math.max(0,1-p.age/p.life)));
      }
      for (const d of drops) {
        const r = d.radius;
        let rx = r, ry = r;
        const showNeck = d.surface === 'bottom' && d.stretch < 1;
        if (showNeck !== d.neckVisible) {
          d.neck.setAttribute('visibility', showNeck ? 'visible' : 'hidden');
          d.neckVisible = showNeck;
        }
        if (d.surface.startsWith('top-') || d.surface.startsWith('bottom-')) {
          const q = d.cornerAngle / (Math.PI / 2);
          const blend = q * q * (3 - 2 * q);
          const upper = d.surface.startsWith('top-');
          rx = r * (upper ? 1.35 - 0.4 * blend : 0.95 + 0.3 * blend);
          ry = r * (upper ? 0.95 + 0.4 * blend : 1.35 - 0.35 * blend);
        } else if (d.surface === 'top') {
          // Change the liquid contour smoothly near the top edge;
          // no rigid shape is rotated at the corner.
          const distance = d.flowSide < 0 ? d.x - BOX.left : BOX.right - d.x;
          const q = BOX.corner > 0 ? 0 : clamp((3 * r - distance) / (2.45 * r));
          const blend = q * q * (3 - 2 * q);
          rx = r * (1.35 - 0.4 * blend);
          ry = r * (0.95 + 0.4 * blend);
        } else if (d.surface === 'left' || d.surface === 'right') {
          const q = BOX.corner > 0 ? 0 : clamp((d.y - (BOX.bottom - 3 * r)) / (2.55 * r));
          const blend = q * q * (3 - 2 * q);
          rx = r * (0.95 + 0.3 * blend);
          ry = r * (1.35 - 0.35 * blend);
        } else if (d.surface === 'bottom') {
          rx = r * (1.25 - 0.25 * d.stretch);
          if (showNeck) {
            const distance = d.y - BOX.bottom;
            ellipse(d.neck, d.anchor, BOX.bottom + Math.max(0, distance) * 0.4,
              r * 0.8 * Math.pow(1 - d.stretch, 0.7),
              Math.max(r * 0.45, Math.abs(distance) * 0.65));
          }
        } else {
          const stretch = Math.sqrt(1 + 0.12 * Math.exp(-d.released * 7) * Math.sin(d.released * 15));
          rx = r / stretch;
          ry = r * stretch;
        }
        ellipse(d.bead, d.x, d.y, rx, ry);
      }
    }

    function animate(now) {
      frameId = null;
      if (!host.isConnected) return;
      updateBox();
      refreshCollisions();
      if (previous !== null) accumulator += Math.min((now - previous) / 1000, 0.05);
      previous = now;
      while (accumulator >= PHYSICS.dt) {
        step(PHYSICS.dt);
        accumulator -= PHYSICS.dt;
      }
      draw();
      frameId = requestAnimationFrame(animate);
    }

    function syncPlayback() {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      previous = null;
      accumulator = 0;
      if (!document.hidden && !reducedMotion.matches) frameId = requestAnimationFrame(animate);
    }

    function smoothEdges() {
      // Smooth the thresholded liquid contour in screen pixels, including
      // zoomed and high-density displays, without changing its geometry.
      const matrix = svg.getScreenCTM();
      const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 0;
      if (scale > 0) host.querySelector('.ch-edge-smoothing').setAttribute('stdDeviation', 0.4 / scale);
    }

    updateBox();
    for (let i = 0; i < 3; i++) {
      const surface = i < 2 ? 'top' : 'bottom';
      const position = i === 0 ? random(BOX.right * .12, BOX.right * .35) : i === 1 ? random(BOX.right * .65, BOX.right * .88) : random(16, BOX.right - 16);
      createDrop(surface, position, random(0.6, 1.8));
    }
    const resize = new ResizeObserver(smoothEdges);
    resize.observe(svg);
    document.addEventListener('visibilitychange', syncPlayback);
    reducedMotion.addEventListener('change', syncPlayback);
    const moverPointer = event => {
      if (event.pointerType === 'touch') return;
      pointer.active = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const sairPointer = () => { pointer.active = false; };
    document.addEventListener('pointermove', moverPointer, {passive:true});
    document.documentElement.addEventListener('pointerleave', sairPointer);
    window.addEventListener('blur', sairPointer);
    host.pararGotas = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      resize.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      reducedMotion.removeEventListener('change', syncPlayback);
      document.removeEventListener('pointermove', moverPointer);
      document.documentElement.removeEventListener('pointerleave', sairPointer);
      window.removeEventListener('blur', sairPointer);
    };
    updateBox();
    smoothEdges();
    refreshCollisions();
    draw();
    syncPlayback();
  
 });
}
