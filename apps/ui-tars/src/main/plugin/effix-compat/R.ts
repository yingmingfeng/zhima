/**
 * 响应信息
 */
class R {
  static SUCCESS = 1;
  static ERROR = -1;

  code: number;
  msg: string;
  data: object;

  constructor(code: number, msg: string, data: object) {
    this.code = code;
    this.msg = msg;
    this.data = data;
  }

  static ok(): R {
    return new R(R.SUCCESS, null, null);
  }

  static okM(msg: string): R {
    return new R(R.SUCCESS, msg, null);
  }

  static okMD(msg: string, data: Object): R {
    return new R(R.SUCCESS, msg, data);
  }

  static error(): R {
    return new R(R.ERROR, null, null);
  }

  static errorM(msg: string): R {
    return new R(R.ERROR, msg, null);
  }

  static errorMD(msg: string, data: Object): R {
    return new R(R.ERROR, msg, data);
  }
}

export default R;
