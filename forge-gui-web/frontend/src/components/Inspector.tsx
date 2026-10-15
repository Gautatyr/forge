import type { CSSProperties } from 'react';
import { commanderTax, currentFace, isCreature, player } from '../model/selectors';
import type { CardFace } from '../model/types';
import { useMatch } from '../state/MatchContext';
import { Card } from './Card';
import { Icon } from './Icon';
import { ManaCost } from './ManaCost';
import styles from './Inspector.module.css';

/** Full card detail: both faces, rules text, P/T breakdown, counters, attachments. */
export function Inspector() {
  const { game, ui, setUi } = useMatch();
  const c = ui.inspectId ? game.cards[ui.inspectId] : undefined;
  if (!c) return null;
  const face = currentFace(c);
  const faces: { face: CardFace; label: string; inPlay: boolean }[] = [
    { face: c.front, label: c.back ? 'Front face' : 'Card', inPlay: !c.transformed },
    ...(c.back ? [{ face: c.back, label: 'Back face', inPlay: !!c.transformed }] : []),
  ];
  const owner = player(game, c.ownerId);
  const controller = player(game, c.controllerId);
  const host = c.attachedTo ? game.cards[c.attachedTo] : undefined;
  const printedP = Number(face.power) || 0;
  const printedT = Number(face.toughness) || 0;

  return (
    <aside className={styles.inspector} aria-label={`Inspect ${c.name}`}>
      <header className={styles.head}>
        <h2>{c.name}</h2>
        <button type="button" className={styles.close} onClick={() => setUi({ inspectId: undefined })}>
          <Icon name="close" /> Close <kbd>Esc</kbd>
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.faces}>
          {faces.map((f) => (
            <figure key={f.label} className={styles.face}>
              {f.face.image ? <img src={f.face.image.large} alt={f.face.name} /> : null}
              {c.back ? (
                <figcaption>
                  {f.label}
                  {f.inPlay && c.zone === 'battlefield' ? ' · in play' : ''}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>

        <div className={styles.details}>
          {faces.map((f) => (
            <section key={f.label} className={styles.text}>
              <h3>
                {f.face.name} <ManaCost cost={f.face.manaCost} />
              </h3>
              <p className={styles.type}>{f.face.typeLine}</p>
              {f.face.oracleText.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </section>
          ))}

          {isCreature(c) && c.zone === 'battlefield' && c.power !== undefined ? (
            <section>
              <h3>Power / toughness</h3>
              <table className={styles.pt}>
                <tbody>
                  <tr>
                    <td>Printed</td>
                    <td>
                      {printedP}/{printedT}
                    </td>
                  </tr>
                  {c.ptModifiers.map((m) => (
                    <tr key={m.source}>
                      <td>{m.source}</td>
                      <td>
                        {m.power >= 0 ? '+' : ''}
                        {m.power}/{m.toughness >= 0 ? '+' : ''}
                        {m.toughness}
                      </td>
                    </tr>
                  ))}
                  <tr className={styles.total}>
                    <td>Now</td>
                    <td>
                      {c.power}/{c.toughness}
                      {c.damage ? ` (${c.damage} damage marked)` : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          ) : null}

          <section>
            <h3>State</h3>
            <ul className={styles.facts}>
              <li>Controller: {controller.isYou ? 'you' : controller.name}</li>
              {owner.id !== controller.id ? <li>Owner: {owner.name}</li> : null}
              <li>Zone: {c.zone}</li>
              {c.zone === 'battlefield' ? <li>{c.tapped ? 'Tapped' : 'Untapped'}</li> : null}
              {c.summoningSick && c.zone === 'battlefield' ? <li>Summoning sick</li> : null}
              {c.isToken ? <li>Token</li> : null}
              {c.isCommander ? <li>Commander · next cast costs {commanderTax(owner, c.id)} more</li> : null}
              {c.counters.map((k) => (
                <li key={k.kind}>
                  {k.count} × {k.kind} counter
                </li>
              ))}
              {c.grantedKeywords.length ? <li>Gained: {c.grantedKeywords.join(', ')}</li> : null}
            </ul>
          </section>

          {host || c.attachments.length ? (
            <section>
              <h3>{host ? 'Attached to' : 'Attachments'}</h3>
              <div className={styles.attachments}>
                {(host ? [host.id] : c.attachments).map((id) => {
                  const a = game.cards[id];
                  return a ? (
                    <div key={id} className={styles.attachment}>
                      <Card
                        card={a}
                        context="thumb"
                        style={{ '--cw': '5.5rem' } as CSSProperties}
                        onActivate={() => setUi({ inspectId: id })}
                      />
                      <span>{a.name}</span>
                    </div>
                  ) : null;
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
