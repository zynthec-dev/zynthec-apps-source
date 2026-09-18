const ADMIN_HOST = 'storage.zynthec.com';
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const local = ['localhost','127.0.0.1'].includes(url.hostname);
  if (!local && url.protocol !== 'https:') {
    url.protocol = 'https:';
    return Response.redirect(url.href, 308);
  }
  if (url.pathname.startsWith('/api/') && url.hostname !== ADMIN_HOST && !local) {
    return Response.json({error:'Die Verwaltung ist nur unter https://storage.zynthec.com verfügbar.'}, {status:403, headers:{'Cache-Control':'no-store'}});
  }
  if (['/admin','/admin/','/admin.html'].includes(url.pathname) && url.hostname !== ADMIN_HOST && !local) {
    return Response.redirect('https://storage.zynthec.com/admin', 302);
  }
  if (url.hostname === ADMIN_HOST && url.pathname === '/') {
    return Response.redirect('https://storage.zynthec.com/admin', 302);
  }
  return context.next();
}
