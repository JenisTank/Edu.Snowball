#!/usr/bin/env python3
"""Generate an init migration (PostgreSQL DDL) from prisma/schema.prisma.

Prisma's schema engine can't be downloaded in this environment, so the baseline
migration is produced deterministically here, mirroring Prisma Migrate's own
output style (validated against backups/latest.sql and in CI with
`prisma migrate deploy` + `migrate diff --exit-code`).

Usage: python3 prisma/generate-init-migration.py
"""
import os
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SCHEMA = (ROOT / 'schema.prisma').read_text()
OUT_DIR = ROOT / 'migrations' / '20261021120000_init'

SCALARS = {
    'String': 'TEXT',
    'Int': 'INTEGER',
    'BigInt': 'BIGINT',
    'Float': 'DOUBLE PRECISION',
    'Decimal': 'DECIMAL(65,30)',
    'Boolean': 'BOOLEAN',
    'DateTime': 'TIMESTAMP(3)',
    'Json': 'JSONB',
    'Bytes': 'BYTEA',
}


def split_tokens(text: str):
    """Whitespace split that keeps (...) and [...] groups intact."""
    out, buf, depth = [], '', 0
    for ch in text:
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth -= 1
        if ch.isspace() and depth == 0:
            if buf:
                out.append(buf)
                buf = ''
        else:
            buf += ch
    if buf:
        out.append(buf)
    return out


def strip_comments(text: str) -> str:
    return re.sub(r'//[^\n]*', '', text)


def blocks(src: str, keyword: str):
    """Yield (name, body) for every `keyword Name { ... }` using brace matching."""
    for m in re.finditer(keyword + r'\s+(\w+)\s*\{', src):
        start = m.end()
        depth, end = 1, None
        for i in range(start, len(src)):
            if src[i] == '{':
                depth += 1
            elif src[i] == '}':
                depth -= 1
                if depth == 0:
                    end = i
                    break
        yield m.group(1), src[start:end]


def parse():
    src = strip_comments(SCHEMA)
    enums = {}
    for name, body in blocks(src, 'enum'):
        enums[name] = [t for t in body.split() if t.isidentifier()]
    models = {}
    for name, body in blocks(src, 'model'):
        fields, model_attrs = [], []
        tokens = split_tokens(body)
        i = 0
        while i < len(tokens):
            tok = tokens[i]
            if tok.startswith('@@'):
                block = tok
                while block.count('(') > block.count(')') and i + 1 < len(tokens):
                    i += 1
                    block += ' ' + tokens[i]
                model_attrs.append(block)
                i += 1
                continue
            if tok.startswith('@'):
                i += 1
                continue
            fname, ftype = tok, tokens[i + 1]
            i += 2
            attrs = []
            while i < len(tokens) and tokens[i].startswith('@') and not tokens[i].startswith('@@'):
                block = tokens[i]
                while block.count('(') > block.count(')') and i + 1 < len(tokens):
                    i += 1
                    block += ' ' + tokens[i]
                attrs.append(block)
                i += 1
            fields.append({'name': fname, 'type': ftype, 'attrs': attrs})
        models[name] = {'name': name, 'fields': fields, 'attrs': model_attrs}
    return enums, models


def attr_attr(attrs, name):
    for a in attrs:
        if a == '@' + name or a.startswith('@' + name + '('):
            return a
    return None


def attr_arg(attr, key=None):
    inner = attr[attr.index('(') + 1 : attr.rindex(')')] if '(' in attr else ''
    if key is None:
        return inner.strip()
    m = re.search(key + r':\s*([^,)]+)', inner)
    return m.group(1).strip() if m else None


def q(ident: str) -> str:
    return '"' + ident + '"'


def column_name(field):
    map_attr = attr_attr(field['attrs'], 'map')
    return attr_arg(map_attr).strip('"') if map_attr else field['name']


def base_type(t: str) -> str:
    return t.rstrip('?').rstrip('[]')


def is_scalar(t: str, enums) -> bool:
    return base_type(t) in SCALARS or base_type(t) in enums


def sql_type(field, enums):
    base = base_type(field['type'])
    db = attr_attr(field['attrs'], 'db')
    if db:
        native = db[db.index('.') + 1 : db.index('(')] if '(' in db else db[db.index('.') + 1 :]
        inner = attr_arg(db)
        upper = native.upper()
        mapping = {
            'UUID': 'UUID',
            'DATE': 'DATE',
            'TIME': 'TIME(3)',
            'TIMESTAMP': 'TIMESTAMP(3)',
            'TEXT': 'TEXT',
            'VARCHAR': 'VARCHAR',
            'DECIMAL': 'DECIMAL',
            'INT': 'INTEGER',
            'BIGINT': 'BIGINT',
            'BOOLEAN': 'BOOLEAN',
            'JSONB': 'JSONB',
            'BYTEA': 'BYTEA',
            'SMALLINT': 'SMALLINT',
            'DOUBLEPRECISION': 'DOUBLE PRECISION',
        }
        if upper not in mapping:
            raise SystemExit(f'unsupported @db type: {db}')
        return mapping[upper] + (f'({inner})' if inner else '')
    if base in enums:
        return q(base)
    return SCALARS[base]


def sql_default(field, enums):
    d = attr_attr(field['attrs'], 'default')
    if not d:
        return ''
    v = attr_arg(d)
    if v == 'now()':
        return 'DEFAULT CURRENT_TIMESTAMP'
    if v in ('uuid()', 'cuid()'):
        return ''  # generated by the Prisma client, not by the database
    if v in ('true', 'false') or re.fullmatch(r'-?\d+(\.\d+)?', v):
        return 'DEFAULT ' + v
    if v.startswith('"'):
        return f"DEFAULT '{v.strip(chr(34))}'"
    if base_type(field['type']) in enums:
        return f"DEFAULT '{v}'"
    return f"DEFAULT '{v}'"


def main():
    enums, models = parse()
    lines = ['-- BumbleB Kidz ERP — initial schema', '-- Generated from prisma/schema.prisma', '']

    for name, values in enums.items():
        vals = ',\n  '.join(f"'{v}'" for v in values)
        lines.append(f'-- CreateEnum\nCREATE TYPE {q(name)} AS ENUM (\n  {vals}\n);\n')

    # ── tables ────────────────────────────────────────────────────────────────
    for model in models.values():
        table = q(table_name(model))
        cols, pks, uniques = [], [], []
        for f in model['fields']:
            if not is_scalar(f['type'], enums):
                continue
            col = column_name(f)
            nullable = f['type'].endswith('?')
            parts = [q(col), sql_type(f, enums)]
            default = sql_default(f, enums)
            if default:
                parts.append(default)
            if not nullable:
                parts.append('NOT NULL')
            cols.append('    ' + ' '.join(parts))
            if attr_attr(f['attrs'], 'id'):
                pks.append(col)
            if attr_attr(f['attrs'], 'unique') and not nullable:
                uniques.append((f'{table_name(model)}_{col}_key', [col]))
        if pks:
            cols.append(f'    CONSTRAINT {q(table_name(model) + "_pkey")} PRIMARY KEY ({", ".join(q(c) for c in pks)})')
        lines.append(f'-- CreateTable\nCREATE TABLE {table} (\n' + ',\n'.join(cols) + '\n);\n')

        for idx_name, idx_cols in uniques:
            lines.append(
                f'CREATE UNIQUE INDEX {q(trunc(idx_name))} ON {table}({", ".join(q(c) for c in idx_cols)});'
            )
        for a in model['attrs']:
            if a.startswith('@@unique('):
                cols_in = [c.strip() for c in attr_arg(a).strip('[]').split(',')]
                cols_in = [column_name(field_by_name(model, c)) for c in cols_in]
                idx = f'{table_name(model)}_{"_".join(cols_in)}_key'
                lines.append(
                    f'CREATE UNIQUE INDEX {q(trunc(idx))} ON {table}({", ".join(q(c) for c in cols_in)});'
                )
        for a in model['attrs']:
            if a.startswith('@@index('):
                cols_in = [c.strip() for c in attr_arg(a).strip('[]').split(',')]
                cols_in = [column_name(field_by_name(model, c)) for c in cols_in]
                idx = f'{table_name(model)}_{"_".join(cols_in)}_idx'
                lines.append(f'CREATE INDEX {q(trunc(idx))} ON {table}({", ".join(q(c) for c in cols_in)});')
        lines.append('')

    # ── foreign keys ──────────────────────────────────────────────────────────
    lines.append('-- AddForeignKey')
    for model in models.values():
        for f in model['fields']:
            if is_scalar(f['type'], enums):
                continue
            rel = attr_attr(f['attrs'], 'relation')
            if not rel:
                continue
            fields_arg = attr_arg(rel, 'fields')
            refs_arg = attr_arg(rel, 'references')
            if not fields_arg or not refs_arg:
                continue
            local = [c.strip().strip('[]') for c in fields_arg.strip('[]').split(',')]
            remote = [c.strip().strip('[]') for c in refs_arg.strip('[]').split(',')]
            target = models[base_type(f['type'])]
            local_cols = [column_name(field_by_name(model, c)) for c in local]
            remote_cols = [column_name(field_by_name(target, c)) for c in remote]
            fk_name = f'{table_name(model)}_{"_".join(local_cols)}_fkey'
            # Prisma's defaults depend on optionality: a required relation is
            # RESTRICT, an optional one SET NULL. Explicit @relation(onDelete:…)
            # wins. Getting this wrong makes `migrate diff` rewrite every FK.
            optional = f['type'].rstrip('[]').endswith('?')
            on_delete = attr_arg(rel, 'onDelete') or ('SET NULL' if optional else 'RESTRICT')
            on_update = attr_arg(rel, 'onUpdate') or 'CASCADE'
            lines.append(
                f'ALTER TABLE {q(table_name(model))} ADD CONSTRAINT {q(trunc(fk_name))} '
                f'FOREIGN KEY ({", ".join(q(c) for c in local_cols)}) REFERENCES '
                f'{q(table_name(target))}({", ".join(q(c) for c in remote_cols)}) '
                f'ON DELETE {on_delete} ON UPDATE {on_update};'
            )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / 'migration.sql').write_text('\n'.join(lines) + '\n')
    (ROOT / 'migrations' / 'migration_lock.toml').write_text(
        '# Please do not edit this file manually\n# It should be added in your version-control system (e.g. Git)\nprovider = "postgresql"\n'
    )
    print(f'wrote {OUT_DIR / "migration.sql"} ({len(lines)} statements/lines)')
    print(f'tables={len(models)} enums={len(enums)}')


def trunc(ident: str) -> str:
    """Postgres identifiers are limited to 63 bytes; Prisma adds no hash here."""
    if len(ident.encode()) <= 63:
        return ident
    suffix = '_idx' if ident.endswith('_idx') else '_key' if ident.endswith('_key') else ''
    keep = 63 - len(suffix)
    return ident[:keep] + suffix


def table_name(model):
    for a in model['attrs']:
        if a.startswith('@@map('):
            return attr_arg(a).strip('"')
    return model['name']


def field_by_name(model, name):
    for f in model['fields']:
        if f['name'] == name:
            return f
    raise SystemExit(f'unknown field {name} on {model["name"]}')


if __name__ == '__main__':
    main()
