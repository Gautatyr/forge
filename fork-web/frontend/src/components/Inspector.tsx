import type { CSSProperties } from 'react';
import { commanderTax, currentFace, isCreature, player } from '../model/selectors';
import type { CardFace } from '../model/types';
import { useMatch } from '../state/MatchContext';
import { Card } from './Card';
import { CardArt } from './CardArt';
import { LINK_LABEL } from './cardLinks';
import { Icon } from './Icon';
import { KeywordBadge } from './KeywordIcons';
import { grantedText, keywordLine } from './keywordCatalog';
import { ManaCost } from './ManaCost';
import styles from './Inspector.module.css';
import { t, tDynamic, type MsgKey } from '../i18n';

const ZONES: Partial<Record<string, MsgKey>> = {
  graveyard: 'zone.graveyard',
  exile: 'zone.exile',
  library: 'zone.library',
  battlefield: 'zone.battlefield',
  hand: 'zone.hand',
  command: 'zone.command',
};

/** Full card detail: both faces, rules text, P/T breakdown, counters, attachments. */
export function Inspector() {
  const { game, ui, setUi } = useMatch();
  const c = ui.inspectId ? game.cards[ui.inspectId] : undefined;
  if (!c) return null;
  const face = currentFace(c);
  const faces: { face: CardFace; label: string; inPlay: boolean }[] = [
    { face: c.front, label: c.back ? t('ins.front') : t('ins.card'), inPlay: !c.transformed },
    ...(c.back ? [{ face: c.back, label: c.faceDown?.seen ? t('ins.faceDown') : t('ins.back'), inPlay: !!c.transformed }] : []),
  ];
  const owner = player(game, c.ownerId);
  const controller = player(game, c.controllerId);
  const host = c.attachedTo ? game.cards[c.attachedTo] : undefined;
  const printedP = Number(face.power) || 0;
  const printedT = Number(face.toughness) || 0;

  return (
    <aside className={styles.inspector} aria-label={t('ins.aria', { name: c.name })}>
      <header className={styles.head}>
        <h2>{c.name}</h2>
        <button type="button" className={styles.close} onClick={() => setUi({ inspectId: undefined })}>
          <Icon name="close" /> {t('ins.close')} <kbd>{t('key.esc')}</kbd>
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.faces}>
          {faces.map((f) => (
            <figure key={f.label} className={styles.face}>
              {f.face.image ? <CardArt key={f.face.image.large} image={f.face.image} size="large" alt={f.face.name} /> : null}
              {c.back ? (
                <figcaption>
                  {f.label}
                  {f.inPlay && c.zone === 'battlefield' ? ` ${t('ins.inPlay')}` : ''}
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

          {c.keywords.length ? (
            <section>
              <h3>{t('ins.keywords')}</h3>
              <ul className={styles.keywords}>
                {c.keywords.map((k, i) => {
                  const line = keywordLine(k);
                  const granted = grantedText(k);
                  return (
                    <li key={i} className={styles.keyword}>
                      <KeywordBadge keyword={k} />
                      <div>
                        <p className={styles.kwName}>{k.label}</p>
                        {line ? <p className={styles.kwLine}>{line}</p> : null}
                        {granted ? <p className={styles.kwGranted}>{granted}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {isCreature(c) && c.zone === 'battlefield' && c.power !== undefined ? (
            <section>
              <h3>{t('ins.pt')}</h3>
              <table className={styles.pt}>
                <tbody>
                  {/* Without a breakdown (live: the engine view has the net P/T only) "Printed" would be a guess. */}
                  {c.ptModifiers ? (
                    <>
                      <tr>
                        <td>{t('ins.printed')}</td>
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
                    </>
                  ) : null}
                  <tr className={styles.total}>
                    <td>{t('ins.now')}</td>
                    <td>
                      {c.power}/{c.toughness}
                      {c.damage ? ` ${t('ins.damageMarked', { count: c.damage })}` : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          ) : null}

          <section>
            <h3>{t('ins.state')}</h3>
            <ul className={styles.facts}>
              <li>{t('ins.controller', { name: controller.isYou ? t('top.you') : controller.name })}</li>
              {owner.id !== controller.id ? <li>{t('ins.owner', { name: owner.name })}</li> : null}
              <li>{t('ins.zone', { zone: ZONES[c.zone] ? tDynamic(ZONES[c.zone]!) : c.zone })}</li>
              {c.zone === 'battlefield' ? <li>{c.tapped ? t('hp.tapped') : t('ins.untapped')}</li> : null}
              {c.summoningSick && c.zone === 'battlefield' ? <li>{t('card.sick')}</li> : null}
              {c.isToken ? <li>{t('ins.token')}</li> : null}
              {c.isCommander ? <li>{t('ins.commanderTax', { tax: commanderTax(owner, c.id) })}</li> : null}
              {c.counters.map((k) => (
                <li key={k.kind}>
                  {t('hp.counter', { count: k.count, kind: k.kind })}
                </li>
              ))}
            </ul>
          </section>

          {host || c.attachments.length ? (
            <section>
              <h3>{host ? t('ins.attachedTo') : t('ins.attachments')}</h3>
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
          {/* Imprint, exiled with…: the cards this one holds, or the one that holds it (what the engine tracks). */}
          {(c.links ?? []).map((l) => {
            const shown = l.cardIds.flatMap((id) => (game.cards[id] ? [game.cards[id]!] : []));
            return shown.length ? (
              <section key={l.kind}>
                <h3>{LINK_LABEL[l.kind]}</h3>
                <div className={styles.attachments}>
                  {shown.map((a) => (
                    <div key={a.id} className={styles.attachment}>
                      <Card card={a} context="thumb" style={{ '--cw': '5.5rem' } as CSSProperties} onActivate={() => setUi({ inspectId: a.id })} />
                      <span>{a.name}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null;
          })}
        </div>
      </div>
    </aside>
  );
}
