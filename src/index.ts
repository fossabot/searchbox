import MooLexer = require('moo');

const TOKEN_OP = 'OP';
const TOKEN_KEY = 'KEY';
const TOKEN_VALUE = 'VALUE';
const TOKEN_FULLTEXT = 'FULLTEXT';

export {parse}

/**
 * Parses a given user input into a structured formula.
 *
 * @param input searchbox input to parse
 * @param opts searchbox options
 */
function parse(input: string, opts?: SearchBoxOptions): Formula {
  const keywords = opts ? (opts.keywords || []) : [];

  const parser = new Parser();
  const lexer = new Lexer(keywords, parser.parse.bind(parser));

  lexer.lex(input);
  return parser.getFormula();
}

/**
 * Formula contains a list of literals.
 */
class Formula {

  private literals: Literal[] = [];

  public append(key: string, value: string, op?: string) {
    let literal = this.literals
      .filter(literal => literal.key === key)
      .find(literal => literal.op === op);

    if (!literal) {
      literal = {key, op, values: []};
      this.literals.push(literal);
    }

    literal.values.push(value);
  }

  public getLiterals(): Literal[] {
    return this.literals;
  }

  public toString(): string {
    return 'Formula:\n' + this.literals
      .map(literal => ` ${literal.op ? literal.op : ''}${literal.key}: [${literal.values}]`)
      .join("\n");
  }
}

/**
 * Parser: parses tokens into a structured formula.
 */
class Parser {

  private query: Formula = new Formula();
  private lastOp?: string;
  private lastKey?: string;

  public getFormula(): Formula {
    return this.query;
  }

  public parse(token: LexerToken): void {
    // console.debug(`Parsing token #${token.type}# : #${token.value}#`);
    switch (token.type) {
      case TOKEN_OP:
        this.lastOp = token.value;
        break;

      case TOKEN_KEY:
        this.lastKey = token.value;
        break;

      case TOKEN_VALUE:
        this.append(this.lastKey!, token.value, this.lastOp);
        this.lastOp = undefined;
        this.lastKey = undefined;
        break;

      case TOKEN_FULLTEXT:
        this.append('fulltext', token.value);
        break;
    }
  }

  private append(key: string, value: string, op?: string) {
    this.query.append(key, value, op);
  }
}

/**
 * Lexer: tokenizer of user input into tokens (lexemes).
 */
class Lexer {

  private readonly lexer: MooLexer.Lexer;
  private readonly handler: LexerTokenHandler;

  public constructor(keywords: string[], handler: LexerTokenHandler) {
    this.handler = handler;

    // Fulltext keyword is omnipresent.
    if (!keywords.includes('fulltext')) keywords.push('fulltext');

    // Define supported operators.
    const operators = ['-'];

    // Define our (unicode) grammar.
    const WS = /[ \t]+/u;
    const OP = new RegExp(`${operators.join('|')}(?=(?:${keywords.join('|')}))`, 'u');
    const SEP = /:/u;
    const KEY = new RegExp(keywords.join('|'), 'u');
    const WORD = new RegExp("(?<=^|[ \f\n\r\t\v.,'\"+\\-!?:]+)(?:.+?)(?=$|[ \f\n\r\t\v.,'\"\+\\-!?:;]+)", "u")
    const WORDS_SQ = /'.*?'/u;
    const WORDS_DQ = /".*?"/u;
    const NON_WORD = /\W+?/u;

    // Define stateful grammar rules.
    this.lexer = MooLexer.states({
      // Initial state: primarily we match keywords and operators here. The rest is fulltext.
      init: {
        WS: WS,
        [TOKEN_OP]: {match: OP},
        [TOKEN_KEY]: {
          match: KEY,
          type: MooLexer.keywords({KEY: keywords}),
          push: 'pair'
        },
        [TOKEN_FULLTEXT]: [
          {match: WORDS_SQ, value: x => x.slice(1, -1)},
          {match: WORDS_DQ, value: x => x.slice(1, -1)},
          {match: WORD, lineBreaks: true},
        ],
        NON_WORD: {match: NON_WORD, lineBreaks: true},
      },

      // Pair state: If a keyword was matched, look for the value and move back to init.
      pair: {
        SEP: {match: SEP},
        [TOKEN_VALUE]: [
          {match: WORDS_SQ, value: x => x.slice(1, -1), pop: 1},
          {match: WORDS_DQ, value: x => x.slice(1, -1), pop: 1},
          {match: WORD, lineBreaks: true, pop: 1},
        ],
      },
    });
  }

  public lex(input: string): void {
    this.lexer.reset(input);
    let token = this.lexer.next();

    while (token !== undefined) {
      switch (token.type) {
        case TOKEN_OP:
        case TOKEN_KEY:
        case TOKEN_VALUE:
        case TOKEN_FULLTEXT:
          this.emitToken(token.type, token.value);
          break;
      }

      token = this.lexer.next();
    }
  }

  protected emitToken(type: string, value: string): void {
    this.handler({type, value});
  }
}
