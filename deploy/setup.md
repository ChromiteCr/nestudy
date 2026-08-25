# 把 nestudy 部署到 nestudy.cn

这台机器上已经跑着 Luminara（`luminara-relay`）和 nes modeling（`modeling-relay` + Caddy）。
**后端是与 modeling 共用的那一个 relay**——账号、额度、skill 商店都是同一份，
所以这里只有前端要发；后端发版走 `modeling.nestudy` 仓库的 `server/deploy/setup.md`。

三个站共用的只有 Caddy 这一个进程和 80/443 两个端口。一台机器上没有第二种可能。

## 0. 动之前

```bash
sudo ./luminara-guard.sh snapshot   # 脚本在 modeling.nestudy/server/deploy/
```

动完跑 `verify`。它断言 Luminara 的配置、单元、代码、**主进程号**都没变——
进程号没变就意味着它自始至终没被重启过。

## 1. 前端

```bash
# 本地
npm run build
rsync -a --delete --exclude CNAME dist/ lumi-Bill@request.nestudy.cn:/tmp/nestudy-web/

# 服务器
sudo rsync -a --delete /tmp/nestudy-web/ /var/www/nestudy/
sudo chown -R caddy:caddy /var/www/nestudy
```

`--exclude CNAME` 是因为那个文件是 GitHub Pages 的东西。仓库里已经删掉了，
这一行留着是防它哪天又被谁加回来。

## 2. Caddy（只在第一次）

```bash
sudo cp deploy/nestudy.caddy /etc/caddy/sites/
sudo caddy validate --config /etc/caddy/Caddyfile
# validate 以 root 跑，会把新站点的日志文件建成 root:root 600，
# 而 Caddy 跑在 caddy 用户下会打不开它——不修的话下一句 reload 直接 permission denied
sudo touch /var/log/caddy/nestudy.log
sudo chown caddy:caddy /var/log/caddy/nestudy.log
sudo chmod 644 /var/log/caddy/nestudy.log
sudo systemctl reload caddy
```

**主 `/etc/caddy/Caddyfile` 一个字节都不用动**——那一行 `import /etc/caddy/sites/*.caddy` 早就在了。

reload 是安全的：Caddy 先把新配置读进来，读不通就非零退出、旧配置继续跑。

## 3. app.nestudy.cn（等 DNS 改完）

它现在的 CNAME 还指着 GitHub Pages。改指 `20.214.225.88` 之后，
把 `nestudy.caddy` 第一行的站点列表加上 `app.nestudy.cn`，再 reload 一次。

**在 DNS 改过来之前不要加**：Caddy 靠 ACME 挑战签证书，名字没解析过来就申请会失败并进退避重试。

## 4. 商店播种

官方那批 skill 要以发布账号的身份投进商店，商店才不是空的，
「别冒充官方」那道确定性闸（判「这个名字有没有被老师账号发过」）也才有内容。

```bash
RELAY_TOKEN=<发布账号的会话令牌> RELAY_BASE=https://nestudy.cn/api npm run store:seed
```

令牌从网页登录后的 `localStorage.nestudy-token` 里取。脚本是幂等的：
版本没递增算「已是最新」，还卡在待审队列里的直接跳过（不重复烧模型调用）。

## 之后每次发版

只有第 1 步。不碰 Caddy，也不碰另外两个应用。

## 踩过的坑

- **顶级域第一次签证书可能失败一次**：Let's Encrypt 二次校验节点解析 `nestudy.cn` 超时
  （`DNS problem: query timed out looking up A`）。Caddy 会自动从 tls-alpn-01 退回 http-01 重试，
  等一分钟就好。不用管，也不要手动重试——重试太密会撞上 LE 的频率限制。
- `caddy validate` 必须带 sudo：用普通用户跑会因为打不开 `/var/log/caddy/relay.log`
  报一个和配置完全无关的 permission denied，看着像配置坏了。
