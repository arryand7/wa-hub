const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /commands — List all commands
router.get('/', async (req, res) => {
  const commands = await prisma.command.findMany({
    include: { app: true, commandGroups: { include: { waGroup: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.render('commands/index', { title: 'Perintah Bot', commands, currentPage: 'commands' });
});

// GET /commands/create — Form create
router.get('/create', async (req, res) => {
  const apps = await prisma.app.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const groups = await prisma.waGroup.findMany({ orderBy: { name: 'asc' } });
  res.render('commands/form', {
    title: 'Tambah Perintah',
    command: null,
    apps,
    groups,
    currentPage: 'commands',
  });
});

// POST /commands — Store
router.post('/', async (req, res) => {
  const {
    app_id,
    trigger_command,
    action_id,
    arg_mapping,
    message_template,
    description,
    all_groups,
    group_ids,
  } = req.body;

  try {
    const command = await prisma.command.create({
      data: {
        appId: parseInt(app_id),
        triggerCommand: trigger_command.toLowerCase().startsWith('/')
          ? trigger_command.toLowerCase()
          : '/' + trigger_command.toLowerCase(),
        actionId: action_id,
        argMapping: arg_mapping || null,
        messageTemplate: message_template,
        description: description || null,
        allGroups: all_groups === 'on',
      },
    });

    // Save group access if not all_groups
    if (all_groups !== 'on' && group_ids) {
      const ids = Array.isArray(group_ids) ? group_ids : [group_ids];
      for (const gid of ids) {
        await prisma.commandGroup.create({
          data: { commandId: command.id, waGroupId: parseInt(gid) },
        });
      }
    }

    req.flash('success', `Perintah "${command.triggerCommand}" berhasil dibuat`);
  } catch (err) {
    console.error('Create command error:', err);
    req.flash(
      'error',
      err.code === 'P2002' ? 'Trigger command sudah digunakan' : 'Gagal membuat perintah'
    );
  }
  res.redirect('/commands');
});

// GET /commands/:id/edit — Form edit
router.get('/:id/edit', async (req, res) => {
  const command = await prisma.command.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { commandGroups: true },
  });
  if (!command) {
    req.flash('error', 'Perintah tidak ditemukan');
    return res.redirect('/commands');
  }

  const apps = await prisma.app.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const groups = await prisma.waGroup.findMany({ orderBy: { name: 'asc' } });
  res.render('commands/form', {
    title: 'Edit Perintah',
    command,
    apps,
    groups,
    currentPage: 'commands',
  });
});

// POST /commands/:id — Update
router.post('/:id', async (req, res) => {
  const {
    app_id,
    trigger_command,
    action_id,
    arg_mapping,
    message_template,
    description,
    all_groups,
    is_active,
    group_ids,
  } = req.body;

  try {
    const id = parseInt(req.params.id);

    await prisma.command.update({
      where: { id },
      data: {
        appId: parseInt(app_id),
        triggerCommand: trigger_command.toLowerCase().startsWith('/')
          ? trigger_command.toLowerCase()
          : '/' + trigger_command.toLowerCase(),
        actionId: action_id,
        argMapping: arg_mapping || null,
        messageTemplate: message_template,
        description: description || null,
        allGroups: all_groups === 'on',
        isActive: is_active === 'on',
      },
    });

    // Re-create group access
    await prisma.commandGroup.deleteMany({ where: { commandId: id } });
    if (all_groups !== 'on' && group_ids) {
      const ids = Array.isArray(group_ids) ? group_ids : [group_ids];
      for (const gid of ids) {
        await prisma.commandGroup.create({
          data: { commandId: id, waGroupId: parseInt(gid) },
        });
      }
    }

    req.flash('success', 'Perintah berhasil diperbarui');
  } catch (err) {
    console.error('Update command error:', err);
    req.flash('error', 'Gagal memperbarui perintah');
  }
  res.redirect('/commands');
});

// POST /commands/:id/delete — Delete
router.post('/:id/delete', async (req, res) => {
  try {
    await prisma.command.delete({ where: { id: parseInt(req.params.id) } });
    req.flash('success', 'Perintah berhasil dihapus');
  } catch (err) {
    req.flash('error', 'Gagal menghapus perintah');
  }
  res.redirect('/commands');
});

module.exports = router;
