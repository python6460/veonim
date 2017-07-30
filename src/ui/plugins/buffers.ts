import { Actions, Events, merge } from '../../utils'
import { call, notify, define } from '../neovim-client'
import { VimBuffer } from '../../functions'
import { basename, dirname } from 'path'
import { filter } from 'fuzzaldrin-plus'
import { onVimCreate } from '../sessions'
import { h, app } from './plugins'
import TermInput from './input'
const { cmd } = notify

interface BufferInfo { name: string, base: string, modified?: boolean, dir: string, duplicate: boolean }
interface State { val: string, buffers: BufferInfo[], cache: BufferInfo[], vis: boolean, ix: number }

onVimCreate(() => define.Buffers`
  let current = bufnr('%')
  let bufs = filter(range(0, bufnr('$')), 'buflisted(v:val)')
  return map(bufs, {key, val -> { 'name': bufname(val), 'cur': val == current, 'mod': getbufvar(val, '&mod') }})
`)

const cleanup = (fullpath: string, cwd: string) => fullpath.includes(cwd)
  ? fullpath.split(cwd + '/')[1]
  : fullpath

const getBuffers = async (cwd: string): Promise<BufferInfo[]> => {
  const buffers = await call.Buffers()
  if (!buffers) return []
  
   return buffers
     .filter((m: VimBuffer, ix: number, arr: any[]) => arr.findIndex(e => e.name === m.name) === ix)
     .filter((m: VimBuffer) => !m.cur)
     .map(({ name, mod }) => ({
       name,
       base: basename(name),
       modified: mod,
       dir: cleanup(dirname(name), cwd)
     }))
    .map((m, ix, arr) => merge(m, {
      duplicate: arr.some((n, ixf) => ixf !== ix && n.base === m.base)
    }))
    .map(m => merge(m, {
      name: m.duplicate ? `${m.dir}/${m.base}` : m.base,
    }))
}

const state: State = { val: '', buffers: [], cache: [], vis: false, ix: 0 }

const hidden = { display: 'none' }
const container = {
  display: 'flex',
  width: '100%',
  'justify-content': 'center',
  'align-items': 'flex-start',
}

const pretty = {
  width: '400px',
  background: '#333',
  'margin-top': '15%'
}

const view = ({ val, buffers, vis, ix }: State, { change, hide, select, next, prev }: any) => h('#files', {
  style: vis ? container : hidden
}, [
  h('div', { style: pretty }, [
    TermInput({ focus: true, val, next, prev, change, hide, select }),

    h('.row', { render: !buffers.length }, 'no other buffers :('),

    h('div', buffers.map((f, key) => h('.row', {
      key,
      css: { active: key === ix },
    }, [
      h('span', {
        render: f.duplicate,
        style: { color: '#666' },
      }, `${f.dir}/`),
      h('span', f.duplicate ? f.base : f.name),
    ]))),
  ])
])

const a: Actions<State> = {}

a.select = (s, a) => {
  const { name } = s.buffers[s.ix]
  if (name) cmd(`b ${name}`)
  a.hide()
}

a.change = (s, _a, val: string) => ({ val, buffers: val
  ? filter(s.buffers, val, { key: 'name' }).slice(0, 10)
  : s.cache.slice(0, 10)
})

a.show = (_s, _a, buffers: BufferInfo[]) => ({ buffers, cache: buffers, vis: true })
a.hide = () => ({ val: '', vis: false, ix: 0 })
a.next = s => ({ ix: s.ix + 1 > 9 ? 0 : s.ix + 1 })
a.prev = s => ({ ix: s.ix - 1 < 0 ? 9 : s.ix - 1 })

const e: Events<State> = {}

e.show = (_s, a, buffers: BufferInfo[]) => a.show(buffers)

const emit = app({ state, view, actions: a, events: e })

export default async () => {
  // TODO: can we just set this globally somewhere whenever cwd is changed and ref here?
  const cwd = await call.getcwd()
  if (!cwd) return

  const buffers = await getBuffers(cwd)
  emit('show', buffers)
}