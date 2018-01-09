'use strict';

//format numbers or dates
var Formatter = function(element, opts) {
  var owner = this;

  if (typeof element === 'string') {
    owner.element = document.querySelector(element);
  } else {
    owner.element = ((typeof element.length !== 'undefined') && element.length > 0) ? element[0] : element;
  }

  if (!owner.element) {
    throw new Error('[cleave.js] Please check the element');
  }

  opts.initValue = owner.element.value;

  owner.properties = Formatter.DefaultProperties.assign({}, opts);

  owner.init();
};

Formatter.prototype = {
  init: function() {
    var owner = this, pps = owner.properties;

    // no need to use this lib
    if (!pps.numeral && !pps.date && (pps.blocksLength === 0 && !pps.prefix)) {
      owner.onInput(pps.initValue);

      return;
    }

    pps.maxLength = Formatter.Util.getMaxLength(pps.blocks);

    owner.isAndroid = Formatter.Util.isAndroid();
    owner.lastInputValue = '';

    owner.onChangeListener = owner.onChange.bind(owner);
    owner.onKeyDownListener = owner.onKeyDown.bind(owner);
    owner.onCutListener = owner.onCut.bind(owner);
    owner.onCopyListener = owner.onCopy.bind(owner);

    owner.element.addEventListener('input', owner.onChangeListener);
    owner.element.addEventListener('keydown', owner.onKeyDownListener);
    owner.element.addEventListener('cut', owner.onCutListener);
    owner.element.addEventListener('copy', owner.onCopyListener);


    owner.initDateFormatter();
    owner.initNumeralFormatter();

    owner.onInput(pps.initValue);
  },

  initNumeralFormatter: function() {
    var owner = this, pps = owner.properties;

    if (!pps.numeral) {
      return;
    }

    pps.numeralFormatter = new Formatter.NumeralFormatter(
      pps.numeralDecimalMark,
      pps.numeralIntegerScale,
      pps.numeralDecimalScale,
      pps.numeralThousandsGroupStyle,
      pps.numeralPositiveOnly,
      pps.stripLeadingZeroes,
      pps.delimiter
    );
  },

  initDateFormatter: function() {
    var owner = this, pps = owner.properties;

    if (!pps.date) {
      return;
    }

    pps.dateFormatter = new Formatter.DateFormatter(pps.datePattern);
    pps.blocks = pps.dateFormatter.getBlocks();
    pps.blocksLength = pps.blocks.length;
    pps.maxLength = Formatter.Util.getMaxLength(pps.blocks);
  },

  onKeyDown: function(event) {
    var owner = this, pps = owner.properties,
      charCode = event.which || event.keyCode,
      Util = Formatter.Util,
      currentValue = owner.element.value;

    if (Util.isAndroidBackspaceKeydown(owner.lastInputValue, currentValue)) {
      charCode = 8;
    }

    owner.lastInputValue = currentValue;

    // hit backspace when last character is delimiter
    if (charCode === 8 && Util.isDelimiter(currentValue.slice(-pps.delimiterLength), pps.delimiter, pps.delimiters)) {
      pps.backspace = true;

      return;
    }

    pps.backspace = false;
  },

  onChange: function() {
    this.onInput(this.element.value);
  },

  onCut: function(e) {
    this.copyClipboardData(e);
    this.onInput('');
  },

  onCopy: function(e) {
    this.copyClipboardData(e);
  },

  copyClipboardData: function(e) {
    var owner = this,
      pps = owner.properties,
      Util = Formatter.Util,
      inputValue = owner.element.value,
      textToCopy = '';

    if (!pps.copyDelimiter) {
      textToCopy = Util.stripDelimiters(inputValue, pps.delimiter, pps.delimiters);
    } else {
      textToCopy = inputValue;
    }

    try {
      if (e.clipboardData) {
        e.clipboardData.setData('Text', textToCopy);
      } else {
        window.clipboardData.setData('Text', textToCopy);
      }

      e.preventDefault();
    } catch (ex) {
      //  empty
    }
  },

  onInput: function(value) {
    var owner = this, pps = owner.properties,
      Util = Formatter.Util;

    // case 1: delete one more character "4"
    // 1234*| -> hit backspace -> 123|
    // case 2: last character is not delimiter which is:
    // 12|34* -> hit backspace -> 1|34*
    // note: no need to apply this for numeral mode
    if (!pps.numeral && pps.backspace && !Util.isDelimiter(value.slice(-pps.delimiterLength), pps.delimiter, pps.delimiters)) {
      value = Util.headStr(value, value.length - pps.delimiterLength);
    }

    // numeral formatter
    if (pps.numeral) {
      if (pps.prefix && (!pps.noImmediatePrefix || value.length)) {
        pps.result = pps.prefix + pps.numeralFormatter.format(value);
      } else {
        pps.result = pps.numeralFormatter.format(value);
      }
      owner.updateValueState();

      return;
    }

    // date
    if (pps.date) {
      value = pps.dateFormatter.getValidatedDate(value);
    }

    // strip delimiters
    value = Util.stripDelimiters(value, pps.delimiter, pps.delimiters);

    // strip prefix
    value = Util.getPrefixStrippedValue(value, pps.prefix, pps.prefixLength);

    // strip non-numeric characters
    value = pps.numericOnly ? Util.strip(value, /[^\d]/g) : value;

    // convert case
    value = pps.uppercase ? value.toUpperCase() : value;
    value = pps.lowercase ? value.toLowerCase() : value;

    // prefix
    if (pps.prefix && (!pps.noImmediatePrefix || value.length)) {
      value = pps.prefix + value;

      // no blocks specified, no need to do formatting
      if (pps.blocksLength === 0) {
        pps.result = value;
        owner.updateValueState();

        return;
      }
    }

    // strip over length characters
    value = Util.headStr(value, pps.maxLength);

    // apply blocks
    pps.result = Util.getFormattedValue(value, pps.blocks, pps.blocksLength, pps.delimiter, pps.delimiters);

    owner.updateValueState();
  },

  setCurrentSelection: function(endPos, oldValue) {
    var elem = this.element;

    // If cursor was at the end of value, just place it back.
    // Because new value could contain additional chars.
    if (oldValue.length !== endPos && elem === document.activeElement) {
      if (elem.createTextRange) {
        var range = elem.createTextRange();

        range.move('character', endPos);
        range.select();
      } else {
        elem.setSelectionRange(endPos, endPos);
      }
    }
  },

  updateValueState: function() {
    var owner = this;
    var endPos = owner.element.selectionEnd;
    var oldValue = owner.element.value;

    // fix Android browser type="text" input field
    // cursor not jumping issue
    if (owner.isAndroid) {
      window.setTimeout(function() {
        owner.element.value = owner.properties.result;
        owner.setCurrentSelection(endPos, oldValue);
      }, 1);

      return;
    }

    owner.element.value = owner.properties.result;
    owner.setCurrentSelection(endPos, oldValue);
  },
  //TODO
  setRawValue: function(value) {
    var owner = this, pps = owner.properties;

    value = value !== undefined && value !== null ? value.toString() : '';

    if (pps.numeral) {
      value = value.replace('.', pps.numeralDecimalMark);
    }

    pps.backspace = false;

    owner.element.value = value;
    owner.onInput(value);
  },

  getRawValue: function() {
    var owner = this,
      pps = owner.properties,
      Util = Formatter.Util,
      rawValue = owner.element.value;

    if (pps.rawValueTrimPrefix) {
      rawValue = Util.getPrefixStrippedValue(rawValue, pps.prefix, pps.prefixLength);
    }

    if (pps.numeral) {
      rawValue = pps.numeralFormatter.getRawValue(rawValue);
    } else {
      rawValue = Util.stripDelimiters(rawValue, pps.delimiter, pps.delimiters);
    }

    return rawValue;
  },

  getISOFormatDate: function() {
    var owner = this,
      pps = owner.properties;

    return pps.date ? pps.dateFormatter.getISOFormatDate() : '';
  },

  getFormattedValue: function() {
    return this.element.value;
  },

  destroy: function() { //TODO
    var owner = this;

    owner.element.removeEventListener('input', owner.onChangeListener);
    owner.element.removeEventListener('keydown', owner.onKeyDownListener);
    owner.element.removeEventListener('cut', owner.onCutListener);
    owner.element.removeEventListener('copy', owner.onCopyListener);
  },

  toString: function() {
    return '[Formatter Object]';
  }
};

Formatter.NumeralFormatter = function(numeralDecimalMark,
                                      numeralIntegerScale,
                                      numeralDecimalScale,
                                      numeralThousandsGroupStyle,
                                      numeralPositiveOnly,
                                      stripLeadingZeroes,
                                      delimiter) {
  var owner = this;

  owner.numeralDecimalMark = numeralDecimalMark || '.';
  owner.numeralIntegerScale = numeralIntegerScale > 0 ? numeralIntegerScale : 0;
  owner.numeralDecimalScale = numeralDecimalScale >= 0 ? numeralDecimalScale : 2;
  owner.numeralThousandsGroupStyle = numeralThousandsGroupStyle || NumeralFormatter.groupStyle.thousand;
  owner.numeralPositiveOnly = !!numeralPositiveOnly;
  owner.stripLeadingZeroes = (undefined == stripLeadingZeroes) ? true : stripLeadingZeroes;
  owner.delimiter = (delimiter || delimiter === '') ? delimiter : ',';
  owner.delimiterRE = delimiter ? new RegExp('\\' + delimiter, 'g') : '';
};

Formatter.NumeralFormatter.groupStyle = {
  thousand: 'thousand',
  none: 'none'
};

Formatter.NumeralFormatter.prototype = {
  getRawValue: function(value) {
    return value.replace(this.delimiterRE, '').replace(this.numeralDecimalMark, '.');
  },

  format: function(value) {
    var owner = this, parts, partInteger, partDecimal = '';

    // strip alphabet letters
    value = value.replace(/[A-Za-z]/g, '')
    // replace the first decimal mark with reserved placeholder
      .replace(owner.numeralDecimalMark, 'M')

      // strip non numeric letters except minus and "M"
      // this is to ensure prefix has been stripped
      .replace(/[^\dM-]/g, '')

      // replace the leading minus with reserved placeholder
      .replace(/^\-/, 'N')

      // strip the other minus sign (if present)
      .replace(/\-/g, '')

      // replace the minus sign (if present)
      .replace('N', owner.numeralPositiveOnly ? '' : '-')

      // replace decimal mark
      .replace('M', owner.numeralDecimalMark);

    // strip any leading zeros
    if (owner.stripLeadingZeroes) {
      value = value.replace(/^(-)?0+(?=\d)/, '$1');
    }

    partInteger = value;

    if (value.indexOf(owner.numeralDecimalMark) >= 0) {
      parts = value.split(owner.numeralDecimalMark);
      partInteger = parts[0];
      partDecimal = owner.numeralDecimalMark + parts[1].slice(0, owner.numeralDecimalScale);
    }

    if (owner.numeralIntegerScale > 0) {
      partInteger = partInteger.slice(0, owner.numeralIntegerScale + (value.slice(0, 1) === '-' ? 1 : 0));
    }

    partInteger = partInteger.replace(/(\d)(?=(\d{3})+$)/g, '$1' + owner.delimiter);

    return partInteger.toString() + (owner.numeralDecimalScale > 0 ? partDecimal.toString() : '');
  }
};


Formatter.DateFormatter = function(datePattern) {
  var owner = this;

  owner.date = [];
  owner.blocks = [];
  owner.datePattern = datePattern;
  owner.initBlocks();
};

Formatter.DateFormatter.prototype = {
  initBlocks: function() {
    var owner = this;
    owner.datePattern.forEach(function(value) {
      if (value === 'Y') {
        owner.blocks.push(4);
      } else {
        owner.blocks.push(2);
      }
    });
  },

  getISOFormatDate: function() {
    var owner = this,
      date = owner.date;

    return date[2] ? (
      date[2] + '-' + owner.addLeadingZero(date[1]) + '-' + owner.addLeadingZero(date[0])
    ) : '';
  },

  getBlocks: function() {
    return this.blocks;
  },

  getValidatedDate: function(value) {
    var owner = this, result = '';

    value = value.replace(/[^\d]/g, '');

    owner.blocks.forEach(function(length, index) {
      if (value.length > 0) {
        var sub = value.slice(0, length),
          sub0 = sub.slice(0, 1),
          rest = value.slice(length);

        switch (owner.datePattern[index]) {
          case 'd':
            if (sub === '00') {
              sub = '01';
            } else if (parseInt(sub0, 10) > 3) {
              sub = '0' + sub0;
            } else if (parseInt(sub, 10) > 31) {
              sub = '31';
            }

            break;

          case 'm':
            if (sub === '00') {
              sub = '01';
            } else if (parseInt(sub0, 10) > 1) {
              sub = '0' + sub0;
            } else if (parseInt(sub, 10) > 12) {
              sub = '12';
            }

            break;
        }

        result += sub;

        // update remaining string
        value = rest;
      }
    });

    return this.getFixedDateString(result);
  },

  getFixedDateString: function(value) {
    var owner = this, datePattern = owner.datePattern, date = [],
      dayIndex = 0, monthIndex = 0, yearIndex = 0,
      dayStartIndex = 0, monthStartIndex = 0, yearStartIndex = 0,
      day, month, year;

    // mm-dd || dd-mm
    if (value.length === 4 && datePattern[0].toLowerCase() !== 'y' && datePattern[1].toLowerCase() !== 'y') {
      dayStartIndex = datePattern[0] === 'd' ? 0 : 2;
      monthStartIndex = 2 - dayStartIndex;
      day = parseInt(value.slice(dayStartIndex, dayStartIndex + 2), 10);
      month = parseInt(value.slice(monthStartIndex, monthStartIndex + 2), 10);

      date = this.getFixedDate(day, month, 0);
    }

    // yyyy-mm-dd || yyyy-dd-mm || mm-dd-yyyy || dd-mm-yyyy || dd-yyyy-mm || mm-yyyy-dd
    if (value.length === 8) {
      datePattern.forEach(function(type, index) {
        switch (type) {
          case 'd':
            dayIndex = index;
            break;
          case 'm':
            monthIndex = index;
            break;
          default:
            yearIndex = index;
            break;
        }
      });

      yearStartIndex = yearIndex * 2;
      dayStartIndex = (dayIndex <= yearIndex) ? dayIndex * 2 : (dayIndex * 2 + 2);
      monthStartIndex = (monthIndex <= yearIndex) ? monthIndex * 2 : (monthIndex * 2 + 2);

      day = parseInt(value.slice(dayStartIndex, dayStartIndex + 2), 10);
      month = parseInt(value.slice(monthStartIndex, monthStartIndex + 2), 10);
      year = parseInt(value.slice(yearStartIndex, yearStartIndex + 4), 10);

      date = this.getFixedDate(day, month, year);
    }

    owner.date = date;

    return date.length === 0 ? value : datePattern.reduce(function(previous, current) {
      switch (current) {
        case 'd':
          return previous + owner.addLeadingZero(date[0]);
        case 'm':
          return previous + owner.addLeadingZero(date[1]);
        default:
          return previous + '' + (date[2] || '');
      }
    }, '');
  },

  getFixedDate: function(day, month, year) {
    day = Math.min(day, 31);
    month = Math.min(month, 12);
    year = parseInt((year || 0), 10);

    if ((month < 7 && month % 2 === 0) || (month > 8 && month % 2 === 1)) {
      day = Math.min(day, month === 2 ? (this.isLeapYear(year) ? 29 : 28) : 30);
    }

    return [day, month, year];
  },

  isLeapYear: function(year) {
    return ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
  },

  addLeadingZero: function(number) {
    return (number < 10 ? '0' : '') + number;
  }
};

Formatter.Util = {
  strip: function(value, re) {
    return value.replace(re, '');
  },

  isDelimiter: function(letter, delimiter, delimiters) {
    // single delimiter
    if (delimiters.length === 0) {
      return letter === delimiter;
    }

    // multiple delimiters
    return delimiters.some(function(current) {
      if (letter === current) {
        return true;
      }
    });
  },

  getDelimiterREByDelimiter: function(delimiter) {
    return new RegExp(delimiter.replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1'), 'g');
  },

  stripDelimiters: function(value, delimiter, delimiters) {
    var owner = this;

    // single delimiter
    if (delimiters.length === 0) {
      var delimiterRE = delimiter ? owner.getDelimiterREByDelimiter(delimiter) : '';

      return value.replace(delimiterRE, '');
    }

    // multiple delimiters
    delimiters.forEach(function(current) {
      value = value.replace(owner.getDelimiterREByDelimiter(current), '');
    });

    return value;
  },

  headStr: function(str, length) {
    return str.slice(0, length);
  },

  getMaxLength: function(blocks) {
    return blocks.reduce(function(previous, current) {
      return previous + current;
    }, 0);
  },

  // strip value by prefix length
  // for prefix: PRE
  // (PRE123, 3) -> 123
  // (PR123, 3) -> 23 this happens when user hits backspace in front of "PRE"
  getPrefixStrippedValue: function(value, prefix, prefixLength) {
    if (value.slice(0, prefixLength) !== prefix) {
      var diffIndex = this.getFirstDiffIndex(prefix, value.slice(0, prefixLength));

      value = prefix + value.slice(diffIndex, diffIndex + 1) + value.slice(prefixLength + 1);
    }

    return value.slice(prefixLength);
  },

  getFirstDiffIndex: function(prev, current) {
    var index = 0;

    while (prev.charAt(index) === current.charAt(index))
      if (prev.charAt(index++) === '')
        return -1;

    return index;
  },

  getFormattedValue: function(value, blocks, blocksLength, delimiter, delimiters) {
    var result = '',
      multipleDelimiters = delimiters.length > 0,
      currentDelimiter;

    // no options, normal input
    if (blocksLength === 0) {
      return value;
    }

    blocks.forEach(function(length, index) {
      if (value.length > 0) {
        var sub = value.slice(0, length),
          rest = value.slice(length);

        result += sub;

        currentDelimiter = multipleDelimiters ? (delimiters[index] || currentDelimiter) : delimiter;

        if (sub.length === length && index < blocksLength - 1) {
          result += currentDelimiter;
        }

        // update remaining string
        value = rest;
      }
    });

    return result;
  },

  isAndroid: function() {
    return navigator && /android/i.test(navigator.userAgent);
  },

  // On Android chrome, the keyup and keydown events
  // always return key code 229 as a composition that
  // buffers the user’s keystrokes
  // see https://github.com/nosir/cleave.js/issues/147
  isAndroidBackspaceKeydown: function(lastInputValue, currentInputValue) {
    if (!this.isAndroid() || !lastInputValue || !currentInputValue) {
      return false;
    }

    return currentInputValue === lastInputValue.slice(0, -1);
  }
};

Formatter.DefaultProperties = {
  // Maybe change to object-assign
  // for now just keep it as simple
  assign: function(target, opts) {
    target = target || {};
    opts = opts || {};

    // date
    target.date = !!opts.date;
    target.datePattern = opts.datePattern || ['d', 'm', 'Y'];
    target.dateFormatter = {};

    // numeral
    target.numeral = !!opts.numeral;
    target.numeralIntegerScale = opts.numeralIntegerScale > 0 ? opts.numeralIntegerScale : 0;
    target.numeralDecimalScale = opts.numeralDecimalScale >= 0 ? opts.numeralDecimalScale : 2;
    target.numeralDecimalMark = opts.numeralDecimalMark || '.';
    target.numeralThousandsGroupStyle = opts.numeralThousandsGroupStyle || 'thousand';
    target.numeralPositiveOnly = !!opts.numeralPositiveOnly;
    target.stripLeadingZeroes = (undefined == opts.stripLeadingZeroes) ? true : opts.stripLeadingZeroes;

    // others
    target.numericOnly = target.date || !!opts.numericOnly;

    target.uppercase = !!opts.uppercase;
    target.lowercase = !!opts.lowercase;

    target.prefix = target.date ? '' : (opts.prefix || '');
    target.noImmediatePrefix = !!opts.noImmediatePrefix;
    target.prefixLength = target.prefix.length;
    target.rawValueTrimPrefix = !!opts.rawValueTrimPrefix;
    target.copyDelimiter = !!opts.copyDelimiter;

    target.initValue = (opts.initValue !== undefined && opts.initValue !== null) ? opts.initValue.toString() : '';

    target.delimiter =
      (opts.delimiter || opts.delimiter === '') ? opts.delimiter :
        (opts.date ? '/' :
            (opts.numeral ? ',' : 'delimiterfoobar')
        );
    target.delimiterLength = target.delimiter.length;
    target.delimiters = opts.delimiters || [];

    target.blocks = opts.blocks || [];
    target.blocksLength = target.blocks.length;

    target.root = (typeof global === 'object' && global) ? global : window;

    target.maxLength = 0;

    target.backspace = false;
    target.result = '';

    return target;
  }
};
